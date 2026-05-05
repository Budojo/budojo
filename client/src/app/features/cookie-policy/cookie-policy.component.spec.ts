import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { CONSENT_STORAGE_KEY, ConsentService } from '../../core/services/consent.service';
import { CookiePolicyComponent } from './cookie-policy.component';

describe('CookiePolicyComponent — canonical English /cookie-policy (#421)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CookiePolicyComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(CookiePolicyComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('renders the English title and version stamp', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Cookie Policy');
    const stamp = root.querySelector('[data-cy="cookie-version-stamp"]');
    expect(stamp?.textContent ?? '').toMatch(/Version/);
    expect(stamp?.textContent ?? '').toMatch(/2026-05-05/);
  });

  it('language toggle points to the Italian translation at /cookie-policy/it', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const itLink = root.querySelector('[data-cy="cookie-lang-it"]');
    expect(itLink?.getAttribute('routerLink')).toBe('/cookie-policy/it');
    const active = root.querySelector('[data-cy="cookie-lang-toggle"] [aria-current="true"]');
    expect(active?.textContent?.trim()).toBe('English');
  });

  it('cross-links to /privacy and /sub-processors', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const privacy = root.querySelector('a[routerLink="/privacy"]');
    const subs = root.querySelector('a[routerLink="/sub-processors"]');
    expect(privacy).toBeTruthy();
    expect(subs).toBeTruthy();
  });

  it('manage-preferences link reopens the banner via the consent service', () => {
    const { cmp } = setup();
    const consent = TestBed.inject(ConsentService);
    consent.acceptAll();
    expect(consent.decided()).toBe(true);
    cmp.managePreferences();
    expect(consent.decided()).toBe(false);
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
