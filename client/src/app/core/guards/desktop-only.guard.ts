import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DesktopBridgeService } from '../services/desktop-bridge.service';

/**
 * Gates a route to the Electron shell (#1228). Backup/restore operate on the
 * local database and only exist on the desktop; a stray deep link on the web
 * lands on the dashboard rather than a page whose every action is unavailable.
 */
export const desktopOnlyGuard: CanActivateFn = () => {
  const bridge = inject(DesktopBridgeService);
  const router = inject(Router);

  return bridge.isDesktop ? true : router.createUrlTree(['/dashboard']);
};
