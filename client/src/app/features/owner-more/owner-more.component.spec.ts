import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { RuntimeService } from '../../core/services/runtime.service';
import { OwnerMoreComponent } from './owner-more.component';

function setup(handle: string | null = 'senseimario', capabilities = ['email', 'community']) {
  const user = signal<{ handle: string | null } | null>({ handle });
  const logout = vi.fn();
  TestBed.configureTestingModule({
    imports: [OwnerMoreComponent],
    providers: [
      provideRouter([{ path: 'auth/login', children: [] }]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: AuthService, useValue: { user, logout } },
      { provide: LanguageService, useValue: { currentLang: signal('en'), setLanguage: vi.fn() } },
      {
        provide: RuntimeService,
        useValue: {
          profile: signal(capabilities.includes('email') ? 'web' : 'desktop'),
          has: signal((c: string) => capabilities.includes(c)),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OwnerMoreComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, logout };
}

describe('OwnerMoreComponent (#1111)', () => {
  it('homes the owner destinations demoted off the bottom bar', () => {
    const { el } = setup();
    for (const cy of ['activity', 'settings', 'support']) {
      expect(el.querySelector(`[data-cy="owner-more-${cy}"]`), cy).not.toBeNull();
    }
  });

  describe('reaching a person (#1476)', () => {
    it('links the in-app form where the server can send it', () => {
      const { el } = setup('senseimario', ['email', 'community']);

      expect(el.querySelector('[data-cy="owner-more-support"]')).not.toBeNull();
      expect(el.querySelector('[data-cy="owner-more-support-mailto"]')).toBeNull();
    });

    it('falls back to a mailto where it cannot', () => {
      // #1464 hid the row on the desktop build because the form was a black
      // hole. Hiding it was the honest half; this is the other half.
      const { el } = setup('senseimario', ['community']);
      const row = el.querySelector('[data-cy="owner-more-support-mailto"]');

      expect(el.querySelector('[data-cy="owner-more-support"]')).toBeNull();
      expect(row).not.toBeNull();
      expect(row?.getAttribute('href')).toContain('mailto:matteobonanno1990@gmail.com');
    });

    it('prefills the version and the build so the first reply is not a question', () => {
      const { el } = setup('senseimario', ['community']);
      const href = decodeURIComponent(
        el.querySelector('[data-cy="owner-more-support-mailto"]')?.getAttribute('href') ?? '',
      );

      expect(href).toContain('Version: ');
      expect(href).toContain('Build: desktop');
      expect(href).toContain('System: ');
    });

    it('shows the address as text, not only as a link target', () => {
      // A `mailto:` does nothing at all on a machine with no mail client
      // configured. An address you can read is the difference between a dead
      // link and a way through.
      const { el } = setup('senseimario', ['community']);

      expect(el.querySelector('[data-cy="owner-more-support-mailto"]')?.textContent).toContain(
        'matteobonanno1990@gmail.com',
      );
    });
  });

  it('does not repeat what the rail already carries (#1462)', () => {
    // Attendance was in both, which makes More a place where some things are
    // and others are too. Stats moved up to the rail, which is where a
    // destination belongs when there is room for it.
    const { el } = setup();
    for (const cy of ['attendance', 'stats', 'whats-new']) {
      expect(el.querySelector(`[data-cy="owner-more-${cy}"]`), cy).toBeNull();
    }
  });

  it('shows the public-profile link with the handle route when the owner has a handle', () => {
    const { el } = setup('senseimario');
    const link = el.querySelector('[data-cy="owner-more-public-profile"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('/dashboard/u/senseimario');
  });

  it('hides the public-profile link when the owner has no handle', () => {
    const { el } = setup(null);
    expect(el.querySelector('[data-cy="owner-more-public-profile"]')).toBeNull();
  });

  it('signs out from the sign-out row', () => {
    const { el, logout } = setup(null);
    (el.querySelector('[data-cy="owner-more-signout"]') as HTMLElement).click();
    expect(logout).toHaveBeenCalled();
  });

  it('gives the sign-out row a distinct signifier class — the only destructive action on the hub (#1116 review)', () => {
    const { el } = setup(null);
    const row = el.querySelector('[data-cy="owner-more-signout"]');
    expect(row?.classList.contains('owner-more__row--signout')).toBe(true);
  });

  it('opens the language picker from the dedicated Language row', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    (el.querySelector('[data-cy="owner-more-language"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
