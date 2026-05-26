import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';

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
      return await this.postSubscription(json.endpoint, json.keys.p256dh, json.keys.auth);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 503) {
        throw new WebPushError('server_not_configured', String(error));
      }
      throw new WebPushError('subscribe_failed', String(error));
    }
  }

  /**
   * POST a subscription envelope to the server-side mirror. Shared by
   * the user-initiated `subscribe()` and the background
   * `reconcileCurrentDevice()`. The backend is idempotent on
   * (user_id, endpoint_hash), so re-POSTing the same endpoint just
   * refreshes the row.
   *
   * @param background when true, opt out of the offline-redirect
   *   interceptor — reconcile runs on app load (not user-initiated),
   *   and a transient blip must NOT teleport the user to `/offline`
   *   mid-bootstrap (memory § background-polls / SKIP_OFFLINE_REDIRECT).
   */
  private async postSubscription(
    endpoint: string,
    p256dh: string,
    auth: string,
    background = false,
  ): Promise<PushDevice> {
    const options = background
      ? { context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true) }
      : {};
    const response = await firstValueFrom(
      this.http.post<PushSubscribeEnvelope>(
        `${environment.apiBase}/api/v1/me/push-subscriptions`,
        { endpoint, keys: { p256dh, auth } },
        options,
      ),
    );
    return response.data;
  }

  /**
   * Verify the push delivery channel works end-to-end (#818). After a
   * successful `subscribe()`, the SPA has no way to confirm that the
   * OS will actually surface notifications — Web Notification API
   * only exposes the SITE-level permission, not the OS-level Chrome /
   * TWA notification toggle that #817 surfaced as the root cause of
   * silent failures.
   *
   * The check:
   *  1. Set up a `swPush.messages` listener filtered on
   *     `data.kind === 'verification'`.
   *  2. POST to `/me/push-subscriptions/test` — the server dispatches
   *     `TestPushNotification` via `WebPushChannel` to ALL the user's
   *     subscriptions (the just-created one + any others).
   *  3. Race the listener against a 5-second timer.
   *
   * Outcomes:
   *  - `'ok'`      — the SW received the test push within the window.
   *                  Channel works.
   *  - `'silent'`  — timeout fired without the SW receiving it. Most
   *                  likely OS-level mute (Chrome notif off in
   *                  Android Settings, battery saver, TWA process
   *                  killed). The SPA surfaces an actionable hint.
   *  - `'unknown'` — the SW isn't enabled (dev mode) OR the test
   *                  endpoint errored (server-side throw, VAPID
   *                  misconfig). Can't conclude either way; the UI
   *                  stays silent to avoid false alarms.
   *
   * Fire-and-forget from the component — runs in the background after
   * the success toast. The user sees a SECOND, distinct toast only
   * when the verification times out.
   */
  async verifyDelivery(timeoutMs: number = 5000): Promise<'ok' | 'silent' | 'unknown'> {
    if (!this.swPush.isEnabled) return 'unknown';

    // Set up the listener BEFORE firing the ping — otherwise a fast
    // SW could fire the push event before our subscribe lands and we
    // would miss the signal.
    const listenerPromise = new Promise<'ok'>((resolve) => {
      const sub = this.swPush.messages.subscribe((rawMessage) => {
        const data = (rawMessage as { notification?: { data?: { kind?: string } } }).notification
          ?.data;
        if (data?.kind === 'verification') {
          sub.unsubscribe();
          resolve('ok');
        }
      });
      // Cleanup buffer past the timeout so the subscription doesn't
      // leak. The race below decides the outcome at `timeoutMs`; the
      // listener stays alive an extra second to absorb a near-miss
      // before unsubscribing.
      setTimeout(() => sub.unsubscribe(), timeoutMs + 1000);
    });

    try {
      // Inline the POST instead of calling `sendTest()` so we can opt
      // out of the offline-redirect interceptor — this is a background
      // poll (not user-initiated), and a transient network blip would
      // otherwise teleport the user to `/offline` mid-subscribe
      // (memory § background-polls / SKIP_OFFLINE_REDIRECT). The
      // user-initiated `sendTest()` keeps the default behaviour so a
      // real loss-of-connectivity on the manual button still routes
      // correctly.
      await firstValueFrom(
        this.http.post(
          `${environment.apiBase}/api/v1/me/push-subscriptions/test`,
          {},
          { context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true) },
        ),
      );
    } catch {
      // Server-side error on the test endpoint — VAPID misconfig, no
      // subscriptions registered, network blip. Can't verify either
      // way; report 'unknown' so the UI doesn't surface a misleading
      // "your phone is muted" toast on a server fault.
      return 'unknown';
    }

    const timeoutPromise = new Promise<'silent'>((resolve) =>
      setTimeout(() => resolve('silent'), timeoutMs),
    );
    return Promise.race([listenerPromise, timeoutPromise]);
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
      return await this.hashEndpoint(sub.endpoint);
    } catch {
      return null;
    }
  }

  /** SHA-256 hex of an endpoint URL — mirrors the server's column. */
  private async hashEndpoint(endpoint: string): Promise<string> {
    const bytes = new TextEncoder().encode(endpoint);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Self-heal the server-side device list after a deploy (#1065).
   *
   * On a Cloudflare deploy the SW updates and the push endpoint can
   * rotate, and/or `WebPushChannel` 410-deletes the row on the next
   * send. The browser keeps a live PushSubscription, but its
   * `endpoint_hash` no longer matches any server row — so the profile
   * UI drops the "this device" pill and the user thinks they must
   * re-accept, and (worse) they stop receiving pushes.
   *
   * This reconciles silently on app load: if the browser HAS a live
   * subscription whose hash is absent from the server list, re-POST it
   * (idempotent). The user never re-accepts; reception is restored.
   *
   * Safe against intentional revokes: revoking the CURRENT device also
   * drops the local subscription (see the profile component +
   * `unsubscribeLocal`), so `getSubscription()` returns null there and
   * this is a no-op — it won't resurrect a device the user revoked.
   *
   * Background HTTP (not user-initiated) → opt out of the offline
   * redirect so a transient blip on load doesn't bounce the user to
   * `/offline`.
   */
  async reconcileCurrentDevice(): Promise<
    'reregistered' | 'in_sync' | 'no_local_subscription' | 'skipped'
  > {
    if (!this.isSupported() || !this.swPush.isEnabled) return 'skipped';

    let sub: PushSubscription | null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      sub = reg ? await reg.pushManager.getSubscription() : null;
    } catch {
      return 'skipped';
    }
    if (!sub?.endpoint) return 'no_local_subscription';

    let hash: string;
    try {
      hash = await this.hashEndpoint(sub.endpoint);
    } catch {
      return 'skipped';
    }

    let devices: readonly PushDevice[];
    try {
      const envelope = await firstValueFrom(
        this.http.get<PushStateEnvelope>(`${environment.apiBase}/api/v1/me/push-subscriptions`, {
          context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true),
        }),
      );
      devices = envelope.data;
    } catch {
      // Offline / server error — leave it; the next app load retries.
      return 'skipped';
    }

    if (devices.some((d) => d.endpoint_hash === hash)) return 'in_sync';

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'skipped';
    try {
      await this.postSubscription(json.endpoint, json.keys.p256dh, json.keys.auth, true);
      return 'reregistered';
    } catch {
      return 'skipped';
    }
  }

  /**
   * Drop THIS browser's local PushSubscription (#1065). Called when the
   * user revokes the current device so the server delete isn't undone
   * by `reconcileCurrentDevice()` on the next load. Best-effort — a
   * failure leaves an orphaned local subscription, which is harmless
   * (the server row is already gone, so no fanout reaches it).
   */
  async unsubscribeLocal(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      await sub?.unsubscribe();
    } catch {
      // ignore — orphaned local subscription is harmless
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
    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiBase}/api/v1/me/push-subscriptions/${id}`),
      );
    } catch (err) {
      // 404 means the row is already gone server-side — typically
      // because `WebPushChannel::send()` auto-deleted it after FCM /
      // Mozilla returned 410 on a push (post-deploy endpoint rotation).
      // The delete intent is satisfied; surface as a no-op so the SPA's
      // catch handler doesn't fire a misleading "Impossibile revocare"
      // toast on the user's tap (#899).
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return;
      }
      throw err;
    }
  }
}
