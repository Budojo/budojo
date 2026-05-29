import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
      provideRouter([]),
      provideAnimationsAsync(),
      {
        provide: AuthService,
        useValue: { user, loadCurrentUser, logout } as unknown as AuthService,
      },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(AthleteDashboardComponent);
  fixture.detectChanges();
  return { fixture, loadCurrentUser };
}

const ATHLETE = {
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: 'mariobjj',
  avatar_url: null,
} as User;

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

  describe('mobile bottom nav (#1109)', () => {
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

  describe('desktop social rail (#1110)', () => {
    it('renders the rail with the same destinations as the bottom nav (feed/academy/attendance/more)', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const rail = fixture.nativeElement.querySelector(
        '[data-cy="athlete-rail"]',
      ) as HTMLElement | null;
      expect(rail).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/me/feed"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/me/academy"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/me/attendance"]')).not.toBeNull();
      expect(rail!.querySelector('a[href="/dashboard/me/more"]')).not.toBeNull();
    });

    it('points the brand link at the feed (the athlete home), matching its "go to home" aria-label', () => {
      // The brand advertises "go to dashboard home"; the athlete's home is the
      // feed (the pi-home tab), NOT the /dashboard/me index — which redirects
      // to settings/profile. #1118 reviewer (Norman/Krug affordance).
      const { fixture } = setup({ cachedUser: ATHLETE });
      const brand = fixture.nativeElement.querySelector(
        'a.rail__brand',
      ) as HTMLAnchorElement | null;
      expect(brand).not.toBeNull();
      expect(brand!.getAttribute('href')).toBe('/dashboard/me/feed');
    });

    it('opens the create sheet from the rail ➕ Create button', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[role="dialog"]')).toBeNull();

      (root.querySelector('[data-cy="rail-create"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('pins a profile chip linking to the More hub, showing the handle', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const chip = fixture.nativeElement.querySelector(
        '[data-cy="rail-profile"]',
      ) as HTMLAnchorElement | null;
      expect(chip).not.toBeNull();
      expect(chip!.getAttribute('href')).toBe('/dashboard/me/more');
      expect(chip!.textContent).toContain('@mariobjj');
    });

    it('demotes settings / payments / documents off the rail (they live on the More hub)', () => {
      const { fixture } = setup({ cachedUser: ATHLETE });
      const rail = fixture.nativeElement.querySelector('[data-cy="athlete-rail"]') as HTMLElement;
      expect(rail.querySelector('a[href="/dashboard/me/payments"]')).toBeNull();
      expect(rail.querySelector('a[href="/dashboard/me/documents"]')).toBeNull();
      expect(rail.querySelector('a[href="/dashboard/me/profile"]')).toBeNull();
    });
  });
});
