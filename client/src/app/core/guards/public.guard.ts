import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Inverse of `authGuard` — keeps `/` for people who are not signed in.
 * Someone with a session gets their roster instead; the first screen has
 * nothing to tell them.
 *
 * **The desktop bypass is gone (#1497).** #1289 sent every signed-out desktop
 * visitor to `/auth/login` instead, and its reasoning was right about the page
 * that existed then: "there is nothing to start free, no pricing and no phone
 * to show a mockup of. Opening on the marketing page made the desktop build
 * look like a website someone had wrapped."
 *
 * Every one of those things has now been deleted. What is at `/` is a welcome:
 * what the app is, one button to create the academy, and the three steps
 * after it. Sending a fresh install past that to a password field is the wrong
 * default in the one case that matters — a first launch, where the person has
 * never had a password to type. Someone signing back in after a sign-out pays
 * one extra click for it, on a link sitting beside the primary button.
 */
export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return router.createUrlTree(['/dashboard/athletes']);
  }

  return true;
};
