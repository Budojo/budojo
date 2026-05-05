import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService, User } from '../services/auth.service';

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
 *   routes.
 *
 * **Bootstrap race.** On a hard refresh the auth_token survives in
 * localStorage but `AuthService::user()` is null until the SPA's
 * `/auth/me` round-trip completes. Without handling this, the guard
 * would default to "owner" and let an athlete into the owner shell
 * during the window. We resolve by calling `auth.loadCurrentUser()`
 * when the cached signal is null — the same pattern `hasAcademyGuard`
 * uses for its `academyService.get()` warm-up call. A 401 response
 * means the token is stale: redirect to `/auth/login`. Any other
 * error blocks navigation defensively (don't silently let through).
 */
function resolveUser(): Observable<User | null> {
  const auth = inject(AuthService);
  const cached = auth.user();
  if (cached !== null) return of(cached);

  return auth.loadCurrentUser().pipe(
    map((u) => u as User | null),
    catchError(() => of(null)),
  );
}

export const roleOwnerGuard: CanActivateFn = () => {
  const router = inject(Router);

  return resolveUser().pipe(
    map((user) => {
      // Null after a /me roundtrip means the token is stale or the
      // session is logged out — kick to login so the user re-auths.
      if (user === null) return router.createUrlTree(['/auth/login']);
      // Default to owner only when role is genuinely missing (cached
      // envelope from before v1.18.0). Real role values are always
      // owner|athlete; the helper preserves backwards compat.
      const role = user.role ?? 'owner';
      return role === 'owner' ? true : router.createUrlTree(['/athlete-portal/welcome']);
    }),
  );
};

export const roleAthleteGuard: CanActivateFn = () => {
  const router = inject(Router);

  return resolveUser().pipe(
    map((user) => {
      if (user === null) return router.createUrlTree(['/auth/login']);
      const role = user.role ?? 'owner';
      return role === 'athlete' ? true : (router.createUrlTree(['/dashboard']) as UrlTree | true);
    }),
  );
};
