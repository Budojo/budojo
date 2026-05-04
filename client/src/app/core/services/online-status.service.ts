import { DOCUMENT, DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/**
 * Tracks the browser's network connectivity (#425). Backed by `navigator.onLine`
 * and the corresponding `online` / `offline` window events. Exposes the state as
 * an Angular `signal` so templates and computed values pick up changes via the
 * regular CD pipeline — no manual subscribe/unsubscribe in components.
 *
 * **Why a service instead of letting components read `navigator.onLine` directly?**
 * Two reasons:
 *   1. `navigator.onLine` is a *value*, not a stream — without listening on the
 *      `online`/`offline` events the UI never updates after the initial read.
 *   2. Centralising the listener removes per-component lifecycle bookkeeping
 *      (the listener has to be torn down on destroy or it leaks).
 *
 * **Heuristic limit (Norman § feedback).** `navigator.onLine = true` only means
 * the OS reports an interface is up, not that any specific server is reachable.
 * For this reason a `false` reading is reliable ("definitely offline"), a
 * `true` reading is optimistic ("probably online; the next API call will tell
 * us"). The `OfflineComponent` therefore relies on the `online` event for
 * auto-recovery and never asserts a working network on its own.
 */
@Injectable({ providedIn: 'root' })
export class OnlineStatusService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Raw signal — true when the browser thinks it has a network connection.
   * Components should read `isOnline` / `isOffline` (computed view) so the
   * underlying signal stays an implementation detail.
   */
  private readonly _isOnline = signal<boolean>(this.readInitialState());

  readonly isOnline = computed(() => this._isOnline());
  readonly isOffline = computed(() => !this._isOnline());

  constructor() {
    const win = this.document.defaultView;
    if (!win) {
      // SSR / non-browser execution — there is no `window` to listen on.
      // The signal stays at its initial value (true by convention) and
      // the service is a no-op.
      return;
    }

    const onOnline = (): void => this._isOnline.set(true);
    const onOffline = (): void => this._isOnline.set(false);

    win.addEventListener('online', onOnline);
    win.addEventListener('offline', onOffline);

    this.destroyRef.onDestroy(() => {
      win.removeEventListener('online', onOnline);
      win.removeEventListener('offline', onOffline);
    });
  }

  private readInitialState(): boolean {
    const win = this.document.defaultView;
    // `navigator.onLine` defaults to `true` when navigator is unavailable
    // (matches the convention from #305's AppUpdateService — optimistic
    // for hosts where we can't measure).
    return win?.navigator?.onLine ?? true;
  }
}
