import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * How often the SPA polls the Angular Service Worker for a new version
 * once it has activated. Mobile sessions in particular can stay open
 * for hours without a navigation that would naturally trigger a new
 * SW registration check; the periodic poll keeps those sessions
 * within ~one hour of the latest stable on `main`.
 *
 * 1 hour was picked to balance staleness window (≤ 60 min after a
 * production deploy) against background traffic (one no-op fetch per
 * hour per open tab is negligible).
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Auto-applies SPA updates the moment the Angular Service Worker has
 * a new version ready, then reloads the tab so the user picks up the
 * fresh bundle without having to clear browser cache by hand.
 *
 * **Why this exists.** With `provideServiceWorker` enabled (see
 * `app.config.ts`) and `ngsw-config.json` declaring the app shell as
 * `installMode: prefetch`, the SW caches the bundle aggressively. A
 * release that flips `index.html` + `main-<hash>.js` on Cloudflare
 * Pages will not surface to a returning user until the SW notices
 * the new manifest AND the page reloads. Without this service the
 * "notice" happens (Angular SW emits `VERSION_READY`) but the reload
 * does not — user sees the old version until they hard-refresh,
 * which beta testers correctly flag as broken UX. This service
 * closes that loop.
 *
 * **Reload trade-off.** We reload as soon as the SW is ready. The
 * alternative — wait for the next `NavigationEnd` and reload then —
 * is more polite (no mid-form-fill data loss) but more complex. The
 * current product has very short forms (athlete create/edit, academy
 * edit), so the worst case is a re-key of a couple of fields. Worth
 * the simplicity. If a long-form surface ever lands, revisit by
 * gating the reload on Router events.
 *
 * **Dev / SSR safety.** `swUpdate.isEnabled` is false in dev mode
 * (`provideServiceWorker(... { enabled: !isDevMode() })`) and on
 * the SSR pass; the start() method early-returns and the service
 * is a complete no-op there.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /**
   * Wire the SW update listener and the periodic update check. Idempotent —
   * a second call is a no-op so a stray re-init at the App component level
   * doesn't double-register the subscription. App.ngOnInit calls this
   * exactly once at boot.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        // activateUpdate() swaps the new SW into the controller slot
        // for the next page load. The reload picks up the fresh bundle.
        // We swallow activateUpdate() errors deliberately — if the
        // activation fails the user just stays on the old version
        // until next session, which is the same as today's behavior.
        this.swUpdate.activateUpdate().then(
          () => this.document.location.reload(),
          () => undefined,
        );
      });

    this.intervalId = setInterval(() => {
      // checkForUpdate() returns a Promise that resolves to a boolean.
      // We don't read the result — VERSION_READY on the subscription
      // above is the load-bearing signal. Errors here are noise (offline
      // tab, request hiccup) and don't change behavior.
      this.swUpdate.checkForUpdate().catch(() => undefined);
    }, UPDATE_CHECK_INTERVAL_MS);

    this.destroyRef.onDestroy(() => {
      if (this.intervalId !== null) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    });
  }
}
