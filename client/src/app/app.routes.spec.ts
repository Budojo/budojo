import { Routes } from '@angular/router';
import { routes } from './app.routes';

/**
 * The routing facts worth pinning (#1463).
 *
 * Not a test of Angular's router — a test of the decisions encoded in the
 * table, the ones that are a single word to change and that nobody would
 * notice regressing until someone signed in and landed somewhere else.
 */
describe('app routes', () => {
  const dashboard = routes.find((r) => r.path === 'dashboard');

  it('lands the owner on the roster, not on the academy page', () => {
    // Signing in navigates to `/dashboard`; this redirect is what decides
    // where that actually is. The academy page is a settings screen — you
    // configure it once and rarely return — and the roster is what the app
    // gets opened for.
    const index = (dashboard?.children as Routes).find((r) => r.path === '');

    expect(index?.redirectTo).toBe('athletes');
    // `pathMatch: 'full'` matters: prefix-matching an empty path would
    // redirect every dashboard route back to the roster.
    expect(index?.pathMatch).toBe('full');
  });

  it('gates both password-reset routes on a mail transport (#1620)', () => {
    // The whole flow is a link in an inbox. On a runtime with no `email`
    // capability the form can only promise something that will never
    // arrive — and the login page hiding its link does nothing for a
    // bookmark, a typed URL or the back button.
    const auth = routes.find((r) => r.path === 'auth');
    const guarded = (auth?.children as Routes)
      .filter((r) => r.path === 'forgot-password' || r.path === 'reset-password')
      .map((r) => (r.canActivate ?? []).length);

    expect(guarded).toEqual([1, 1]);
  });

  it('keeps the roster behind the owner + academy guards', () => {
    // The redirect above is only safe because the parent is guarded: without
    // `hasAcademyGuard` a brand-new account would land on a roster it has no
    // academy for, which is the state the onboarding flow exists to avoid.
    const guards = (dashboard?.canActivate ?? []).map((g) => (g as { name?: string }).name);

    expect(guards).toContain('authGuard');
    expect(guards).toContain('hasAcademyGuard');
  });
});
