import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DesktopBridgeService } from '../services/desktop-bridge.service';

/**
 * Inverse of `authGuard` — protects PUBLIC routes from already-authenticated
 * visitors. A user who's already logged in shouldn't see the marketing
 * landing page; they get bounced straight into their dashboard. Mirrors the
 * pattern every SaaS uses (Linear, Cal.com, etc.) — the marketing surface
 * is for prospects only.
 *
 * Used on the landing route at `/` (#330). Could also be applied to
 * `/auth/login` and `/auth/register` to short-circuit a returning user
 * who clicks back into the auth flow accidentally, but the existing auth
 * components handle that case themselves so we don't double-guard for now.
 */
export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const bridge = inject(DesktopBridgeService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return router.createUrlTree(['/dashboard/athletes']);
  }

  // Inside Budojo Desktop there is no prospect to market to: the app is already
  // installed, there is nothing to "start free", no pricing and no phone to
  // show a mockup of. Opening on the marketing page made the desktop build look
  // like a website someone had wrapped. Sign-in is the honest front door.
  if (bridge.isDesktop) {
    return router.createUrlTree(['/auth/login']);
  }

  return true;
};
