import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { MeProfileComponent } from './me-profile.component';
import { AuthService } from '../../core/services/auth.service';
import type { User } from '../../core/services/auth.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup(opts: { user?: Partial<User> | null } = {}) {
  const userSig = signal<User | null>((opts.user as User | null | undefined) ?? null);
  const updateProfile = vi.fn();

  TestBed.configureTestingModule({
    imports: [MeProfileComponent],
    providers: [
      MessageService,
      {
        provide: AuthService,
        useValue: { user: userSig, updateProfile } as unknown as AuthService,
      },
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MeProfileComponent);
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    updateProfile,
  };
}

describe('MeProfileComponent (#610, M7 PR-D slice 1 + slice 6 edit)', () => {
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

  describe('edit mode (slice 6)', () => {
    const populatedUser = {
      first_name: 'Mario',
      last_name: 'Rossi',
      handle: 'mariobjj',
      email: 'mario@example.com',
      email_verified_at: '2026-05-10T08:00:00Z',
    };

    it('shows the read-only card with an Edit button by default', () => {
      const { el } = setup({ user: populatedUser });
      expect(el.querySelector('[data-cy="me-profile-edit"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="me-profile-edit-form"]')).toBeNull();
    });

    it('switches to the edit form pre-filled with current values when Edit is clicked', () => {
      const { fixture, el } = setup({ user: populatedUser });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      const form = el.querySelector('[data-cy="me-profile-edit-form"]');
      expect(form).not.toBeNull();
      expect(
        (el.querySelector('[data-cy="me-profile-input-first-name"]') as HTMLInputElement).value,
      ).toBe('Mario');
      expect(
        (el.querySelector('[data-cy="me-profile-input-handle"]') as HTMLInputElement).value,
      ).toBe('mariobjj');
    });

    it('calls updateProfile on submit with trimmed/lowercased values + null for empty handle', () => {
      const { fixture, el, updateProfile } = setup({ user: populatedUser });
      updateProfile.mockReturnValue(of(populatedUser));

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      const firstName = el.querySelector(
        '[data-cy="me-profile-input-first-name"]',
      ) as HTMLInputElement;
      firstName.value = '  Luca  ';
      firstName.dispatchEvent(new Event('input'));
      const handle = el.querySelector('[data-cy="me-profile-input-handle"]') as HTMLInputElement;
      handle.value = '';
      handle.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (el.querySelector('[data-cy="me-profile-save"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: 'Luca',
        last_name: 'Rossi',
        handle: null,
      });
    });

    it('returns to the read-only card on cancel', () => {
      const { fixture, el } = setup({ user: populatedUser });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-cy="me-profile-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="me-profile-edit-form"]')).toBeNull();
      expect(el.querySelector('[data-cy="me-profile-card"]')).not.toBeNull();
    });

    it('keeps the edit form open on submit error so the user can correct + retry', () => {
      const { fixture, el, updateProfile } = setup({ user: populatedUser });
      updateProfile.mockReturnValue(
        throwError(() => ({ status: 422, error: { errors: { handle: ['taken'] } } })),
      );

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-cy="me-profile-save"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="me-profile-edit-form"]')).not.toBeNull();
    });

    it('auto-lowercases the handle as the user types (#756, Elizabeth feedback)', () => {
      const { fixture, el } = setup({ user: populatedUser });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      const handle = el.querySelector('[data-cy="me-profile-input-handle"]') as HTMLInputElement;
      handle.value = 'Eli';
      handle.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      // Elizabeth typed "Eli" and the pattern validator silently rejected
      // her. Auto-lowercase converts upper→lower while typing so the
      // pattern matches without surprise — see #756.
      expect(handle.value).toBe('eli');
    });

    it('renders a contextual sub-label with a concrete URL example in edit mode (#756)', () => {
      const { fixture, el } = setup({ user: populatedUser });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      const sublabel = el.querySelector('[data-cy="me-profile-handle-context"]');
      expect(sublabel).not.toBeNull();
      expect(sublabel?.textContent).toContain('budojo.it');
    });

    it('shows the clear hint when the user already has a handle (#756)', () => {
      const { fixture, el } = setup({ user: populatedUser });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="me-profile-handle-clear-hint"]')).not.toBeNull();
    });

    it('hides the clear hint when the user has no handle yet (#756)', () => {
      const { fixture, el } = setup({
        user: { ...populatedUser, handle: null },
      });

      (el.querySelector('[data-cy="me-profile-edit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el.querySelector('[data-cy="me-profile-handle-clear-hint"]')).toBeNull();
    });
  });
});
