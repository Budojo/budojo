import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
 * uses for its `academyService.get()` warm-up call.
 *
 * **Error semantics on the warm-up call.** `resolveUser()` returns a
 * three-arm discriminated union: `{ kind: 'user', user }` for a
 * resolved envelope, `{ kind: 'unauthenticated' }` when /me responds
 * with 401 (stale token — caller redirects to /auth/login), and
 * `{ kind: 'error' }` for any OTHER failure (network glitch, 5xx,
 * timeout). The two error arms differ on purpose: a 5xx on /me
 * shouldn't bounce a logged-in user to the login form, so the
 * "unknown error" arm makes the caller block navigation (return
 * false) instead of redirecting.
 */
type ResolveResult = { kind: 'user'; user: User } | { kind: 'unauthenticated' } | { kind: 'error' };

function resolveUser(): Observable<ResolveResult> {
  const auth = inject(AuthService);
  const cached = auth.user();
  if (cached !== null) return of({ kind: 'user', user: cached });

  return auth.loadCurrentUser().pipe(
    map((u): ResolveResult => ({ kind: 'user', user: u })),
    catchError((err: unknown): Observable<ResolveResult> => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        return of({ kind: 'unauthenticated' });
      }
      return of({ kind: 'error' });
    }),
  );
}

export const roleOwnerGuard: CanActivateFn = () => {
  const router = inject(Router);

  return resolveUser().pipe(
    map((result) => {
      if (result.kind === 'unauthenticated') return router.createUrlTree(['/auth/login']);
      if (result.kind === 'error') return false;
      // Default to owner only when role is genuinely missing (cached
      // envelope from before v1.18.0). Real role values are always
      // owner|athlete; the helper preserves backwards compat.
      const role = result.user.role ?? 'owner';
      return role === 'owner' ? true : router.createUrlTree(['/athlete-portal/welcome']);
    }),
  );
};

export const roleAthleteGuard: CanActivateFn = () => {
  const router = inject(Router);

  return resolveUser().pipe(
    map((result): boolean | UrlTree => {
      if (result.kind === 'unauthenticated') return router.createUrlTree(['/auth/login']);
      if (result.kind === 'error') return false;
      const role = result.user.role ?? 'owner';
      return role === 'athlete' ? true : router.createUrlTree(['/dashboard']);
    }),
  );
};
