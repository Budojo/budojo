import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The renderer side of the Electron preload bridge (#1225).
 *
 * One job today: when the main process says "navigate here" — the user
 * clicked a native toast — route to that path. The bridge is absent outside
 * Budojo Desktop, so every call is optional-chained and the service is a no-op
 * on the web; nothing here decides *what* to show, only where to go.
 *
 * Callbacks from the bridge arrive outside Angular's zone; the navigation is
 * wrapped in `NgZone.run` so change detection sees it.
 */
@Injectable({ providedIn: 'root' })
export class DesktopBridgeService {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** True inside the Electron shell. */
  get isDesktop(): boolean {
    return typeof window !== 'undefined' && window.__BUDOJO__ !== undefined;
  }

  /** Subscribes to toast-click navigation; idempotent no-op on the web. */
  startNavigationRelay(): void {
    const bridge = typeof window !== 'undefined' ? window.__BUDOJO__ : undefined;

    if (bridge?.onNavigate === undefined) {
      return;
    }

    const unsubscribe = bridge.onNavigate((path) => {
      this.zone.run(() => {
        void this.router.navigateByUrl(path);
      });
    });

    this.destroyRef.onDestroy(unsubscribe);
  }
}
