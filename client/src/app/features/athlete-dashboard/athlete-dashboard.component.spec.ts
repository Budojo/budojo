import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { EMPTY } from 'rxjs';
import { AthleteDashboardComponent } from './athlete-dashboard.component';
import { AuthService } from '../../core/services/auth.service';
import type { User } from '../../core/services/auth.service';
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
    expect(root.querySelector('[data-cy="topbar-hamburger"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-feed"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-academy"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-attendance"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-me-profile"]')).not.toBeNull();
    expect(root.querySelector('[data-cy="nav-sign-out"]')).not.toBeNull();
  });
});
