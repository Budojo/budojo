import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Role-based route gate (#445, M7 PR-D).
 *
 * - `roleOwnerGuard` blocks athlete users from owner-side routes (the
 *   whole `/dashboard` tree + the `/setup` wizard). Athletes get
 *   redirected to `/athlete-portal/welcome` instead — the dedicated
 *   shell where they can self-serve. Without this guard an athlete
 *   visiting `/dashboard` would hit `hasAcademyGuard`, which 404s on
 *   their (non-existent) academy and bounces them to `/setup` — a
 *   page that's hard-coded for owners creating their first academy.
 *
 * - `roleAthleteGuard` is the inverse: blocks owners from athlete-only
 *   routes. Owners reaching `/athlete-portal/*` (e.g. by hand-typed
 *   URL) get redirected back to `/dashboard`.
 *
 * Both guards rely on `AuthService::user()` being already populated.
 * The standard SPA bootstrap loads `/auth/me` on app start so the
 * signal is hydrated before any guarded route resolves; if the
 * signal is null (cached envelope from before #445) we treat the
 * user as an owner — the safe default that preserves the
 * v1.17.0-and-earlier experience.
 */
export const roleOwnerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user();
  // Default to owner when role is missing (old envelopes, missed
  // refresh after token adopt, etc.). The owner shell is the
  // backwards-compatible path; an athlete user with a missing
  // role on the envelope still couldn't reach owner-side mutations
  // because the server-side role gate (PR-F) will land later.
  const role = user?.role ?? 'owner';

  if (role === 'owner') return true;

  return router.createUrlTree(['/athlete-portal/welcome']);
};

export const roleAthleteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user();
  const role = user?.role ?? 'owner';

  if (role === 'athlete') return true;

  return router.createUrlTree(['/dashboard']);
};
