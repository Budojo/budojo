import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AuthService, User } from '../../../core/services/auth.service';
import { UserFlairComponent, UserFlairShape } from './user-flair.component';

const baseUser = (overrides: Partial<UserFlairShape> = {}): UserFlairShape => ({
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: 'mariorossi',
  avatar_url: null,
  belt: null,
  ...overrides,
});

function setup(
  user: UserFlairShape,
  compact = false,
  role: User['role'] = 'owner',
): { fixture: ComponentFixture<UserFlairComponent>; root: HTMLElement } {
  const authStub = {
    user: signal<{ role: User['role'] } | null>({ role }),
  };
  TestBed.configureTestingModule({
    imports: [UserFlairComponent],
    providers: [
      provideRouter([]),
      ...provideI18nTesting(),
      { provide: AuthService, useValue: authStub },
    ],
  });
  const fixture = TestBed.createComponent(UserFlairComponent);
  fixture.componentRef.setInput('user', user);
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('UserFlairComponent (#604)', () => {
  it('renders as a router link when the user has a handle', () => {
    const { root } = setup(baseUser());
    const link = root.querySelector<HTMLAnchorElement>('[data-cy="flair-link"]');
    expect(link).not.toBeNull();
    // Owner shell → /dashboard/u/<handle>
    expect(link!.getAttribute('href')).toBe('/dashboard/u/mariorossi');
    expect(root.querySelector('.flair__name')?.textContent?.trim()).toBe('Mario Rossi');
    expect(root.querySelector('.flair__handle')?.textContent?.trim()).toBe('@mariorossi');
  });

  it('renders as plain text (no link) when handle is null', () => {
    const { root } = setup(baseUser({ handle: null }));
    expect(root.querySelector('[data-cy="flair-link"]')).toBeNull();
    expect(root.querySelector('.flair')).not.toBeNull();
    expect(root.querySelector('.flair__handle')).toBeNull();
  });

  it('falls back to first-name + last-initial when handle is missing', () => {
    const { root } = setup(baseUser({ handle: null }));
    // "Mario R." — privacy-leaning fallback from the component docstring.
    expect(root.querySelector('.flair__name')?.textContent?.trim()).toBe('Mario R.');
  });

  it('uses just the first name when last_name is also missing (handle null + empty last)', () => {
    const { root } = setup(baseUser({ handle: null, last_name: '' }));
    expect(root.querySelector('.flair__name')?.textContent?.trim()).toBe('Mario');
  });

  it('uses full_name verbatim when a handle is present (no first-letter fallback)', () => {
    // Full_name may be different from "Mario Rossi" (married name, etc.);
    // the component must NOT compute it when a handle exists.
    const { root } = setup(baseUser({ full_name: 'Mario Rossi-Bianchi' }));
    expect(root.querySelector('.flair__name')?.textContent?.trim()).toBe('Mario Rossi-Bianchi');
  });

  it('routes athletes to /dashboard/me/u/<handle> (opposite shell)', () => {
    const { root } = setup(baseUser(), false, 'athlete');
    expect(
      root.querySelector<HTMLAnchorElement>('[data-cy="flair-link"]')!.getAttribute('href'),
    ).toBe('/dashboard/me/u/mariorossi');
  });

  it('hides the avatar in compact mode (used inside comment rows)', () => {
    const { root } = setup(baseUser(), /* compact */ true);
    expect(root.querySelector('app-user-avatar')).toBeNull();
    expect(root.querySelector('.flair--compact')).not.toBeNull();
  });

  it('renders the belt badge when a belt is present', () => {
    const { root } = setup(baseUser({ belt: 'blue' }));
    expect(root.querySelector('app-belt-badge')).not.toBeNull();
  });
});
