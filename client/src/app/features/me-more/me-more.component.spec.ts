import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { MeMoreComponent } from './me-more.component';

function setup(handle: string | null = 'mariobjj') {
  const user = signal<{ handle: string | null } | null>({ handle });
  const logout = vi.fn();
  TestBed.configureTestingModule({
    imports: [MeMoreComponent],
    providers: [
      provideRouter([{ path: 'auth/login', children: [] }]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: AuthService, useValue: { user, logout } },
      { provide: LanguageService, useValue: { currentLang: signal('en'), setLanguage: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(MeMoreComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, logout };
}

describe('MeMoreComponent (#1109)', () => {
  it('homes the secondary destinations: payments, documents, settings', () => {
    const { el } = setup();
    expect(el.querySelector('[data-cy="me-more-payments"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-more-documents"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="me-more-settings"]')).not.toBeNull();
  });

  it('shows the public-profile link with the handle route when the user has a handle', () => {
    const { el } = setup('mariobjj');
    const link = el.querySelector('[data-cy="me-more-public-profile"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('/dashboard/me/u/mariobjj');
  });

  it('hides the public-profile link when the user has no handle', () => {
    const { el } = setup(null);
    expect(el.querySelector('[data-cy="me-more-public-profile"]')).toBeNull();
  });

  it('signs out from the sign-out row', () => {
    const { el, logout } = setup(null);
    (el.querySelector('[data-cy="me-more-signout"]') as HTMLElement).click();
    expect(logout).toHaveBeenCalled();
  });

  it('opens the language picker from the dedicated Language row (#1109)', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    (el.querySelector('[data-cy="me-more-language"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
