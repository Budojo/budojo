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
  | 'subscribe_failed';

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
   *  - `permission_denied`     — user clicked Block on the prompt
   *  - `server_not_configured` — backend returned 503 (VAPID unset)
   *  - `subscribe_failed`      — vendor push service errored
   */
  async subscribe(vapidPublicKey: string): Promise<PushDevice> {
    if (!this.isSupported() || !this.swPush.isEnabled) {
      throw new WebPushError('not_supported');
    }

    let subscription: PushSubscription;
    try {
      subscription = await this.swPush.requestSubscription({
        serverPublicKey: vapidPublicKey,
      });
    } catch (error) {
      // `requestSubscription` rejects with the underlying DOMException
      // when the user denies permission OR the push service errors.
      // The two have distinct user-visible cures (settings flip vs.
      // try again later), so we split on `Notification.permission`
      // after the throw rather than on error.name (which varies by
      // browser).
      if (this.currentPermission() === 'denied') {
        throw new WebPushError('permission_denied', String(error));
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
