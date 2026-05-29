import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { EMPTY } from 'rxjs';
import { AthleteDashboardComponent } from './athlete-dashboard.component';
import { AuthService } from '../../core/services/auth.service';
import type { User } from '../../core/services/auth.service';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(opts: { cachedUser?: Partial<User> | null } = {}) {
  const user = signal<User | null>((opts.cachedUser as User | null | undefined) ?? null);
  const loadCurrentUser = vi.fn(() => EMPTY);
  const logout = vi.fn();

  TestBed.configureTestingModule({
    imports: [AthleteDashboardComponent],
    providers: [
      // Real Router with an empty route set. We spy on its
      // `navigate` after the TestBed configures so we don't fight
      // the internal initialization of provideRouter (which needs a
      // real root config the partial-mock pattern can't supply).
      provideRouter([]),
      provideAnimationsAsync(),
      {
        provide: AuthService,
        useValue: { user, loadCurrentUser, logout } as unknown as AuthService,
      },
      ...provideI18nTesting(),
    ],
  });

  const router = TestBed.inject(Router);
  const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(AthleteDashboardComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, loadCurrentUser, logout, navigateSpy };
}

describe('AthleteDashboardComponent (#610, M7 PR-D slice 1)', () => {
  it('hydrates the cached user via /auth/me on init when the signal is null', () => {
    const { loadCurrentUser } = setup({ cachedUser: null });
    expect(loadCurrentUser).toHaveBeenCalledOnce();
  });

  it('does NOT hit /auth/me when the cached user is already populated', () => {
    const { loadCurrentUser } = setup({
      cachedUser: { first_name: 'Mario', last_name: 'Rossi' } as User,
    });
    expect(loadCurrentUser).not.toHaveBeenCalled();
  });

  it('signOut() calls auth.logout and navigates to /auth/login', () => {
    const { cmp, logout, navigateSpy } = setup({
      cachedUser: { first_name: 'Mario', last_name: 'Rossi' } as User,
    });

    cmp.signOut();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigateSpy).toHaveBeenCalledOnce();
    expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
  });

  it('renders the brand glyph, sidebar nav, and sign-out button (skeleton chrome)', () => {
    const { fixture } = setup({
      cachedUser: {
        first_name: 'Mario',
        last_name: 'Rossi',
        full_name: 'Mario Rossi',
        handle: 'mariobjj',
        avatar_url: null,
      } as User,
    });

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="nav-me-feed"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-academy"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-attendance"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-payments"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-documents"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-settings"]')).not.toBeNull();
    // Athlete with a handle gets the public-profile sidebar row (#863).
    expect(root.querySelector('[data-cy="nav-me-my-profile"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-sign-out"]')).not.toBeNull();
  });

  describe('mobile bottom nav (#1109)', () => {
    const ATHLETE = {
      first_name: 'Mario',
      last_name: 'Rossi',
      full_name: 'Mario Rossi',
      handle: 'mariobjj',
      avatar_url: null,
    } as User;

    it('renders the bottom nav with feed / academy / attendance / more tabs + the create button', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-bottom-nav')).not.toBeNull();
      expect(root.querySelector('[data-cy="bottomnav-feed"]')).not.toBeNull();
      expect(root.querySelector('[data-cy="bottomnav-academy"]')).not.toBeNull();
      expect(root.querySelector('[data-cy="bottomnav-attendance"]')).not.toBeNull();
      expect(root.querySelector('[data-cy="bottomnav-more"]')).not.toBeNull();
      expect(root.querySelector('[data-cy="bottomnav-create"]')).not.toBeNull();
    });

    it('opens the create sheet when the center ➕ is activated', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[role="dialog"]')).toBeNull();

      (root.querySelector('[data-cy="bottomnav-create"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('retires the hamburger drawer toggle (replaced by the bottom nav)', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      expect(fixture.nativeElement.querySelector('[data-cy="topbar-hamburger"]')).toBeNull();
    });
  });

  describe('sidebar profile / settings split (#863, M9 slice C — athlete shell)', () => {
    it('renders the Settings nav voice with the cog icon (renamed from Profile)', () => {
      const { fixture } = setup({
        cachedUser: {
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Mario Rossi',
          handle: 'mariobjj',
          avatar_url: null,
        } as User,
      });

      const link = fixture.nativeElement.querySelector(
        '[data-cy="nav-me-settings"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.textContent).toContain('Settings');
      expect(link!.querySelector('i.pi-cog')).not.toBeNull();
      // Route is unchanged — /dashboard/me/profile still hosts the
      // athlete-side identity surface; only the label + icon changed.
      expect(link!.getAttribute('href')).toBe('/dashboard/me/profile');
    });

    it('renders the My profile voice linking to /dashboard/me/u/<handle> when the user has a handle', () => {
      const { fixture } = setup({
        cachedUser: {
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Mario Rossi',
          handle: 'mariobjj',
          avatar_url: null,
        } as User,
      });

      const link = fixture.nativeElement.querySelector(
        '[data-cy="nav-me-my-profile"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.textContent).toContain('My profile');
      expect(link!.querySelector('i.pi-id-card')).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('/dashboard/me/u/mariobjj');
    });

    it('hides the My profile voice when the user has no handle (handle is opt-in today)', () => {
      const { fixture } = setup({
        cachedUser: {
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Mario Rossi',
          handle: null,
          avatar_url: null,
        } as User,
      });

      const link = fixture.nativeElement.querySelector(
        '[data-cy="nav-me-my-profile"]',
      ) as HTMLAnchorElement | null;
      expect(link).toBeNull();
    });
  });
});
