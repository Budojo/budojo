import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AthletePortalWelcomeComponent } from './athlete-portal-welcome.component';
import { AuthService } from '../../../core/services/auth.service';
import type { User } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

function setup(opts: { user?: Partial<User> | null } = {}) {
  const user = signal<User | null>((opts.user as User | null | undefined) ?? null);
  const logout = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  TestBed.configureTestingModule({
    imports: [AthletePortalWelcomeComponent],
    providers: [
      {
        provide: AuthService,
        useValue: { user, logout } as unknown as AuthService,
      },
      { provide: Router, useValue: { navigate } as Partial<Router> },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(AthletePortalWelcomeComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, logout, navigate };
}

describe('AthletePortalWelcomeComponent (#445 M7 PR-D minimal)', () => {
  it('greets the athlete by full_name when the cached user is populated', () => {
    const { fixture } = setup({ user: { full_name: 'Mario Rossi' } });

    const title = fixture.nativeElement.querySelector(
      '[data-cy="athlete-welcome-title"]',
    ) as HTMLElement;
    expect(title.textContent).toContain('Mario Rossi');
  });

  it('renders the bare title without a comma when the cached user is null', () => {
    const { fixture } = setup({ user: null });

    const title = fixture.nativeElement.querySelector(
      '[data-cy="athlete-welcome-title"]',
    ) as HTMLElement;
    // No trailing ", " when userName() is empty.
    expect(title.textContent).not.toContain(',');
  });

  it('signOut() logs the user out and navigates to /auth/login', () => {
    const { cmp, logout, navigate } = setup({ user: { full_name: 'Anyone' } });

    cmp.signOut();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
