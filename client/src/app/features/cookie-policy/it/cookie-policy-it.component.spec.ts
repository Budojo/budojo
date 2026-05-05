import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { CONSENT_STORAGE_KEY } from '../../../core/services/consent.service';
import { CookiePolicyItComponent } from './cookie-policy-it.component';

describe('CookiePolicyItComponent — Italian /cookie-policy/it (#421)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CookiePolicyItComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(CookiePolicyItComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('renders the Italian title and version stamp', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Cookie Policy');
    const stamp = root.querySelector('[data-cy="cookie-version-stamp"]');
    expect(stamp?.textContent ?? '').toMatch(/Versione/);
    expect(stamp?.textContent ?? '').toMatch(/2026-05-05/);
  });

  it('language toggle points back to the canonical English /cookie-policy', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const enLink = root.querySelector('[data-cy="cookie-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/cookie-policy');
    const active = root.querySelector('[data-cy="cookie-lang-toggle"] [aria-current="true"]');
    expect(active?.textContent?.trim()).toBe('Italiano');
  });

  it('cross-links to /privacy/it and /sub-processors', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a[routerLink="/privacy/it"]')).toBeTruthy();
    expect(root.querySelector('a[routerLink="/sub-processors"]')).toBeTruthy();
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
