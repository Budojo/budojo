import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeProfileComponent } from './me-profile.component';
import { AuthService } from '../../core/services/auth.service';
import type { User } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(opts: { user?: Partial<User> | null } = {}) {
  const user = signal<User | null>((opts.user as User | null | undefined) ?? null);

  TestBed.configureTestingModule({
    imports: [MeProfileComponent],
    providers: [
      {
        provide: AuthService,
        useValue: { user } as unknown as AuthService,
      },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MeProfileComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('MeProfileComponent (#610, M7 PR-D slice 1)', () => {
  it('renders the loading state when the cached user is null', () => {
    const { el } = setup({ user: null });

    expect(el.querySelector('[data-cy="me-profile-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-profile-card"]')).toBeNull();
  });

  it('renders the first name, last name, handle, and email when the cached user is populated', () => {
    const { el } = setup({
      user: {
        first_name: 'Mario',
        last_name: 'Rossi',
        handle: 'mariobjj',
        email: 'mario@example.com',
        email_verified_at: '2026-05-10T08:00:00Z',
      },
    });

    expect(el.querySelector('[data-cy="me-profile-card"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-profile-first-name"]')?.textContent).toContain('Mario');
    expect(el.querySelector('[data-cy="me-profile-last-name"]')?.textContent).toContain('Rossi');
    expect(el.querySelector('[data-cy="me-profile-handle"]')?.textContent).toContain('mariobjj');
    expect(el.querySelector('[data-cy="me-profile-email"]')?.textContent).toContain(
      'mario@example.com',
    );
  });

  it('shows the no-handle placeholder when handle is null', () => {
    const { el } = setup({
      user: {
        first_name: 'Mario',
        last_name: 'Rossi',
        handle: null,
        email: 'mario@example.com',
        email_verified_at: '2026-05-10T08:00:00Z',
      },
    });

    const handleEl = el.querySelector('[data-cy="me-profile-handle"]');
    expect(handleEl?.querySelector('.profile__placeholder')).not.toBeNull();
  });

  it('renders the verified badge when email_verified_at is set', () => {
    const { el } = setup({
      user: {
        first_name: 'Mario',
        last_name: 'Rossi',
        handle: 'mariobjj',
        email: 'mario@example.com',
        email_verified_at: '2026-05-10T08:00:00Z',
      },
    });

    expect(el.querySelector('[data-cy="me-profile-email-verified"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-profile-email-unverified"]')).toBeNull();
  });

  it('renders the unverified badge when email_verified_at is null', () => {
    const { el } = setup({
      user: {
        first_name: 'Mario',
        last_name: 'Rossi',
        handle: 'mariobjj',
        email: 'mario@example.com',
        email_verified_at: null,
      },
    });

    expect(el.querySelector('[data-cy="me-profile-email-unverified"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-profile-email-verified"]')).toBeNull();
  });
});
