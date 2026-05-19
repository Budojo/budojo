import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Browser Web Push subscriber (#694, closes the client half of #419).
 *
 * Wraps three concerns the SPA used to lack:
 *
 *   - **Capability detection** — `isSupported()` checks the browser
 *     APIs are present; `swPush.isEnabled` checks Angular's service
 *     worker is registered. In dev (`ng serve`), the service worker
 *     is disabled via `provideServiceWorker({ enabled: !isDevMode() })`
 *     so subscribe will short-circuit with `not_supported` — by design,
 *     not a bug.
 *
 *   - **VAPID handshake** — the backend exposes the public key at
 *     `GET /me/push-subscriptions` under `meta.vapid_public_key`.
 *     Without it the `PushManager.subscribe()` call can't authenticate
 *     to the vendor push service.
 *
 *   - **Server-side mirror** — every successful `PushManager.subscribe()`
 *     POSTs the envelope to `/me/push-subscriptions`. The server is
 *     the authoritative list ("your devices"); the local PushSubscription
 *     object only matters until the next page load.
 *
 * Permission denial is *non-recoverable* from the SPA — once
 * `Notification.permission === 'denied'`, the user has to flip the
 * site permission in their browser settings. The UI surfaces this
 * state explicitly so we don't spin a useless permission prompt that
 * gets auto-rejected.
 */
export interface PushDevice {
  readonly id: number;
  readonly endpoint_host: string;
  /**
   * SHA-256 hash of the endpoint URL, exposed by the server (#822) so
   * the SPA can match against `sha256(currentSubscription.endpoint)`
   * and identify which device row corresponds to the current browser.
   */
  readonly endpoint_hash: string;
  readonly last_seen_at: string | null;
  readonly created_at: string;
}

export interface PushStateMeta {
  readonly vapid_public_key: string | null;
  readonly enabled: boolean;
}

export interface PushState {
  readonly devices: readonly PushDevice[];
  readonly meta: PushStateMeta;
}

interface PushStateEnvelope {
  readonly data: readonly PushDevice[];
  readonly meta: PushStateMeta;
}

interface PushSubscribeEnvelope {
  readonly data: PushDevice;
}

/**
 * Why a typed alias instead of `'not_supported' | ...` inline at every
 * call site: the UI maps these tokens to translated strings, the spec
 * pins them, and a typo at any of the three places would silently fall
 * through to "unknown error". A central union keeps the contract tight.
 */
export type WebPushFailureReason =
  | 'not_supported'
  | 'permission_denied'
  | 'server_not_configured'
  | 'subscribe_failed'
  | 'ios_pwa_required'
  | 'brave_push_disabled';

export class WebPushError extends Error {
  constructor(
    public readonly reason: WebPushFailureReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'WebPushError';
  }
}

@Injectable({ providedIn: 'root' })
export class WebPushService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);

  /**
   * Browser-side feature gate. The two checks below are independent:
   * `serviceWorker` is the SW registration API (every Chromium-based
   * browser since ~2015); `PushManager` is the Push API (a slightly
   * narrower set — Safari only added it in 16.4 + only inside an
   * installed PWA / Add to Home Screen). Returning `false` here is
   * how the UI distinguishes "unsupported" from "supported but
   * server-side not configured" — two different chips in the profile
   * section.
   */
  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window
    );
  }

  /**
   * iOS Safari supports the Push API surface AND the permission
   * prompt since 16.4 — but only delivers actual notifications when
   * the site is **installed as a Home Screen PWA** and opened from
   * that icon (`navigator.standalone === true` OR
   * `display-mode: standalone`). From a regular Safari tab the
   * `requestSubscription()` call succeeds, the server-side mirror
   * persists, but APNs silently refuses to deliver. Subscribe
   * short-circuits with `ios_pwa_required` when this returns `true`
   * so the UI surfaces an iOS-specific hint instead of pretending
   * the flow worked (#816).
   */
  isIosNonStandalone(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false;
    }
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      return false;
    }
    const legacyStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
    const mediaStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    return !(legacyStandalone || mediaStandalone);
  }

  /**
   * Brave exposes itself via the (Brave-only) `navigator.brave.isBrave()`
   * async API (Chromium UA strings are intentionally identical, so UA
   * sniffing is unreliable). Used in the `subscribe()` catch path to
   * distinguish Brave's "Use Google services for push messaging" toggle
   * being off (manifests as a `NotSupportedError` / `AbortError` on
   * `PushManager.subscribe()`) from a generic vendor failure (#811).
   *
   * Returns `false` on any non-Brave browser, when the global is
   * missing, or when the async check rejects.
   */
  async isBrave(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const isBraveFn = (navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } })
      .brave?.isBrave;
    if (typeof isBraveFn !== 'function') return false;
    try {
      return Boolean(await isBraveFn.call((navigator as unknown as { brave: unknown }).brave));
    } catch {
      return false;
    }
  }

  /**
   * Wraps `Notification.permission` so callers don't have to feature-
   * detect `Notification` first. The 'denied' fallback when the global
   * is missing is intentional: an environment without the
   * `Notification` global can't grant permission, so reporting 'denied'
   * lets the UI surface the "permission denied" branch instead of
   * crashing on `undefined.permission`.
   */
  currentPermission(): NotificationPermission {
    if (typeof Notification === 'undefined') {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Single source of truth for the profile UI's "Browser notifications"
   * section. Reads the active subscriptions AND the VAPID/server-side
   * config in one round-trip — the meta.enabled flag gates the toggle
   * (a server with empty VAPID config can't accept subscribes, so the
   * UI shows "Server not configured" instead of letting the user fire
   * a 503).
   */
  fetchState(): Observable<PushState> {
    return this.http
      .get<PushStateEnvelope>(`${environment.apiBase}/api/v1/me/push-subscriptions`)
      .pipe(map((response) => ({ devices: response.data, meta: response.meta })));
  }

  /**
   * Full subscribe flow: ask Angular's `SwPush` to call
   * `PushManager.subscribe()` (which internally prompts for permission
   * if needed), then POST the resulting envelope to the backend. The
   * backend is idempotent on (user_id, endpoint_hash) so re-subscribing
   * on the same browser just refreshes the stored keys.
   *
   * Failure modes mapped to a typed reason so the UI renders the right
   * branch (vs. a generic "something went wrong"):
   *  - `not_supported`         — SW or PushManager missing
   *  - `ios_pwa_required`      — iOS Safari needs PWA install (#816)
   *  - `permission_denied`     — user clicked Block on the prompt
   *  - `brave_push_disabled`   — Brave with "Use Google services
   *                              for push messaging" off (#811)
   *  - `server_not_configured` — backend returned 503 (VAPID unset)
   *  - `subscribe_failed`      — vendor push service errored
   */
  async subscribe(vapidPublicKey: string): Promise<PushDevice> {
    if (!this.isSupported() || !this.swPush.isEnabled) {
      throw new WebPushError('not_supported');
    }

    // iOS Safari guard (#816) — short-circuit BEFORE the subscribe
    // call so the user sees a platform-specific hint instead of a
    // misleading "all set" path that silently fails at APNs.
    if (this.isIosNonStandalone()) {
      throw new WebPushError('ios_pwa_required');
    }

    let subscription: PushSubscription;
    try {
      subscription = await this.swPush.requestSubscription({
        serverPublicKey: vapidPublicKey,
      });
    } catch (error) {
      // `requestSubscription` rejects with the underlying DOMException
      // when the user denies permission OR the push service errors.
      // Three branches:
      //  1. Permission denied — `Notification.permission` flips to
      //     'denied'. Cures: open browser site settings.
      //  2. Brave-with-Google-services-off — surfaces as a
      //     `NotSupportedError` / `AbortError`. Cures: flip the
      //     toggle at `brave://settings/privacy`. Detected via
      //     `navigator.brave.isBrave()` async API (#811).
      //  3. Generic vendor error — anything else.
      if (this.currentPermission() === 'denied') {
        throw new WebPushError('permission_denied', String(error));
      }
      const errName = (error as { name?: string })?.name ?? '';
      if ((errName === 'NotSupportedError' || errName === 'AbortError') && (await this.isBrave())) {
        throw new WebPushError('brave_push_disabled', String(error));
      }
      throw new WebPushError('subscribe_failed', String(error));
    }

    const json = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new WebPushError('subscribe_failed', 'malformed PushSubscription');
    }

    try {
      const response = await firstValueFrom(
        this.http.post<PushSubscribeEnvelope>(
          `${environment.apiBase}/api/v1/me/push-subscriptions`,
          {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 503) {
        throw new WebPushError('server_not_configured', String(error));
      }
      throw new WebPushError('subscribe_failed', String(error));
    }
  }

  /**
   * SHA-256 hash of the CURRENT browser's PushSubscription endpoint,
   * if one exists (#822). Mirrors the server-side
   * `PushSubscription.endpoint_hash` column so the UI can identify
   * which row in the device list is "this device" and hide the
   * redundant "Add another device" affordance when the current
   * browser is already subscribed.
   *
   * Returns `null` when:
   *  - The browser has no service-worker registration, OR
   *  - The SW has no active PushSubscription, OR
   *  - `crypto.subtle` is unavailable (very old browsers / non-secure
   *    contexts — same set that would also fail `isSupported()`).
   *
   * Stable across page loads: the hash is a function of the endpoint
   * URL, which the browser keeps stable until the user revokes the
   * permission OR the vendor invalidates the endpoint.
   */
  async currentEndpointHash(): Promise<string | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
      return null;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return null;
      const sub = await reg.pushManager.getSubscription();
      if (!sub?.endpoint) return null;
      const bytes = new TextEncoder().encode(sub.endpoint);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return null;
    }
  }

  /**
   * Fire a one-shot diagnostic push to the calling user's stored
   * subscriptions (#819). Wraps `POST /me/push-subscriptions/test`.
   * The server dispatches a `TestPushNotification` via `WebPushChannel`
   * only (no inbox row), so the user can self-verify their device's
   * push channel is healthy at any time.
   *
   * Bubbles the underlying HTTP error so the caller can branch on
   * status (e.g. 422 when no subscriptions exist on the user — gate
   * the UI button on the device list to avoid this branch).
   */
  async sendTest(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiBase}/api/v1/me/push-subscriptions/test`, {}),
    );
  }

  /**
   * Revoke a single device by deleting its server-side row. The
   * server is the authoritative list — once the row is gone the
   * fanout (#696) skips that browser, regardless of whether the
   * browser still holds an active `PushSubscription` object.
   *
   * **Why we do NOT also call `swPush.unsubscribe()`**: that method
   * unsubscribes the CURRENT browser's `PushSubscription`. If the
   * user is revoking a different device from the list, calling it
   * here would silently kill THIS browser's subscription while
   * leaving its server row in place — the inverse of what the user
   * asked for. The robust fix needs the backend to return
   * `endpoint_hash` so we can compare against
   * `sha256(currentSubscription.endpoint)` and only unsubscribe
   * locally on a match; until that lands, deferring to the server
   * delete is the safer trade-off. The orphaned local subscription
   * is harmless — the next push fanout simply doesn't include it.
   */
  async unsubscribe(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${environment.apiBase}/api/v1/me/push-subscriptions/${id}`),
    );
  }
}
