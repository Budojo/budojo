import { HttpClient, HttpContext } from '@angular/common/http';
import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge, timer } from 'rxjs';
import { catchError, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VERSION } from '../../../environments/version';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';

/**
 * How often the SPA polls `/version.json` to detect that a deploy has
 * superseded the bundle currently running in this tab.
 *
 * 20 minutes balances the staleness window (a returning user picks up
 * a new release within at most ~20 min after the deploy + the focus
 * event firing on tab activation) against background traffic — one
 * conditional GET per twenty minutes per open tab is negligible at
 * Cloudflare-edge cost.
 */
const VERSION_CHECK_INTERVAL_MS = 20 * 60 * 1000;

/**
 * Sentinel SHA that ships in `environments/version.ts` when the
 * `prebuild` script hasn't run (fresh clone, `ng serve` without `npm
 * run build` first). The service is a complete no-op in that state —
 * a dev tab forcibly reloading itself on every focus event would be
 * a disaster for the developer's flow.
 */
const DEV_SENTINEL_SHA = 'dev';

/**
 * Query parameter that triggers the same nuclear cache-bust sequence
 * as a version mismatch, regardless of what `/version.json` currently
 * reports. Operators can hand the URL to a stuck user
 * (`https://budojo.it/?force-update=1`); a single visit unregisters
 * the user's service worker, clears every Cache Storage entry, and
 * reloads — escaping any SW state the periodic check can't reach
 * (e.g. SAFE_MODE before #398, pre-#305 bundles with no
 * VersionCheckService at all).
 */
const FORCE_UPDATE_PARAM = 'force-update';

interface VersionManifest {
  readonly tag: string;
  readonly sha: string;
  readonly buildTime: string;
}

/**
 * Runtime cache-bust layer that complements `AppUpdateService` with a
 * service-worker-independent escape hatch.
 *
 * **Why this exists.** `AppUpdateService` (#305 + #398) listens to
 * Angular's `SwUpdate.versionUpdates` and reloads on `VERSION_READY`.
 * That works when the SW is healthy AND the listener itself is
 * present in the running bundle. It does NOT cover:
 *
 *   - Users on a pre-#305 bundle (no listener shipped) — the
 *     auto-update logic itself lives inside the bundle they're stuck
 *     on. Catch-22.
 *   - PWAs pinned to the iOS home screen with the tab in background
 *     for weeks — `setInterval(checkForUpdate, 1h)` doesn't fire when
 *     iOS Safari has suspended the tab.
 *   - SAFE_MODE SW corruption beyond what the unrecoverable handler
 *     can recover from.
 *
 * This service polls `/version.json` (always-fresh from the Worker —
 * see `worker/index.js` § NO_CACHE_PATHS) on three triggers — boot,
 * `window.focus`, and a 20-minute interval — and on a mismatch with
 * the bundle's embedded `VERSION.sha`, runs the nuclear cache-bust:
 * `getRegistrations()` → `unregister()`, `caches.keys()` →
 * `caches.delete()`, then `location.reload()`. No dependency on the
 * Angular SW at all; works even when the SW is in a corrupted state
 * because it never reads from it.
 *
 * **Boot also handles `?force-update=1`** — a manual escape hatch for
 * users we identify as stuck. Drop the URL in their hand, one tap and
 * they're freed.
 *
 * **Dev / SSR safety.** When `VERSION.sha === 'dev'` (the sentinel
 * shipped in `environments/version.ts` until the prebuild script
 * runs), `start()` early-returns — `ng serve` and fresh-clone first
 * boots are completely unaffected.
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  private started = false;

  /**
   * Wire the focus listener, the periodic poll, and the boot-time
   * `?force-update=1` handler. Idempotent — a second call is a no-op.
   *
   * The `started` latch flips AFTER the early-return guards (force-
   * update handler + DEV sentinel) so a no-op call doesn't permanently
   * disable later initialization in the same session — mirrors the
   * shape of `AppUpdateService.start()`.
   */
  start(): void {
    // Desktop (#1224): there is no /version.json to poll — the shell serves
    // the bundle over app:// and a miss is a real 404 — and no service worker
    // or cache to nuke. Electron owns updates. Guarded, not deleted: the
    // service stays valid for the web build.
    if (environment.runtime === 'desktop') {
      return;
    }

    // Boot-time force-update handler runs before the version-check
    // pipeline so a stuck user can hit the URL without the (broken)
    // bundle's HTTP layer needing to work — `nuke()` only depends on
    // `navigator.serviceWorker`, `caches`, and `location.reload`,
    // none of which the running bundle can have corrupted.
    if (this.consumeForceUpdateFlag()) {
      this.nuke();
      return;
    }

    if (VERSION.sha === DEV_SENTINEL_SHA) {
      // Sentinel build (`ng serve`, fresh clone before `npm run
      // build`). A force-reload loop in dev is intolerable —
      // every save-and-refresh cycle would explode. Skip the poll
      // entirely; the developer doesn't need cache-bust ergonomics
      // because hot-reload already gives them the latest code.
      return;
    }

    // SSR / test bootstrap with no DOM defaultView: skip the whole
    // service. The previous shape fell back to `?? window`, but if
    // `defaultView` is null the global `window` is also undefined in
    // SSR — referencing it would throw a `ReferenceError` at boot.
    // Copilot caught this on PR #551.
    const win = this.document.defaultView;
    if (!win) return;

    if (this.started) return;
    this.started = true;

    const focus$ = fromEvent(win, 'focus');
    const interval$ = timer(0, VERSION_CHECK_INTERVAL_MS);

    merge(focus$, interval$)
      .pipe(
        // `switchMap` gives us the natural "supersede in-flight on
        // every new trigger" semantics — if focus and the timer fire
        // back-to-back, we don't end up with two parallel /version.json
        // fetches racing each other.
        switchMap(() =>
          this.http
            .get<VersionManifest>('/version.json', {
              // Cache-bust query param belt-and-braces alongside the
              // Worker's no-cache headers — a misconfigured proxy or
              // an aggressive corporate cache could still strip headers
              // but won't ignore a unique URL.
              params: { _: Date.now().toString() },
              // Opt out of `errorInterceptor`'s `status === 0` →
              // `/offline` global redirect. A background poll failing
              // mid-form should never navigate the user away from
              // their work; the `catchError` below absorbs the failure
              // and the next interval tick retries.
              context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true),
            })
            .pipe(
              catchError(() => {
                // Network error, 404, parse error — all benign. The
                // periodic timer will try again. We don't want a
                // transient hiccup to nuke the user's tab.
                return of(null);
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((manifest) => {
        if (manifest === null) return;
        if (manifest.sha === VERSION.sha) return;
        // Drift detected. The user's bundle is on `VERSION.sha`; the
        // server's current bundle is on `manifest.sha`. Nuke and
        // reload so the next request hits the network with no SW or
        // HTTP cache between.
        this.nuke();
      });
  }

  /**
   * Strip `?force-update=1` (or any truthy `force-update` value) from
   * the URL and return whether it was present. Stripping uses
   * `history.replaceState` so a subsequent `location.reload()` after
   * `nuke()` doesn't re-trigger the same handler in an infinite loop.
   */
  private consumeForceUpdateFlag(): boolean {
    const win = this.document.defaultView;
    if (!win) return false;

    const url = new URL(win.location.href);
    if (!url.searchParams.has(FORCE_UPDATE_PARAM)) return false;

    url.searchParams.delete(FORCE_UPDATE_PARAM);
    // Replace the URL so the reload that follows `nuke()` lands on a
    // clean URL — otherwise the same flag would re-fire the handler
    // and we'd loop forever.
    win.history.replaceState(win.history.state, '', url.toString());
    return true;
  }

  /**
   * The full cache-bust sequence: unregister every active service
   * worker, delete every Cache Storage entry, then hard-reload the
   * tab. Best-effort throughout — a missing API (older browser,
   * Cypress harness, SSR pass) reduces to a plain reload, which is
   * still the right thing because at minimum it bypasses any in-memory
   * state the user might be carrying.
   */
  private nuke(): void {
    const win = this.document.defaultView;
    if (!win) return;

    const navigator = win.navigator;
    const serviceWorker = navigator?.serviceWorker;
    const caches = win.caches;

    const swUnregister = serviceWorker
      ? serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.allSettled(registrations.map((r) => r.unregister())))
          .catch(() => undefined)
      : Promise.resolve();

    const cachesDelete = caches
      ? caches
          .keys()
          .then((keys) => Promise.allSettled(keys.map((k) => caches.delete(k))))
          .catch(() => undefined)
      : Promise.resolve();

    Promise.allSettled([swUnregister, cachesDelete]).finally(() => {
      // `location.reload()` (no argument) is the modern equivalent of
      // the deprecated `reload(true)` — combined with the SW being
      // unregistered above, every resource refetches from network.
      win.location.reload();
    });
  }
}
