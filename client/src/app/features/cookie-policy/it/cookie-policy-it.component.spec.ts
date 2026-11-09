import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { CONSENT_STORAGE_KEY, ConsentService } from '../../../core/services/consent.service';
import { RuntimeProfile, RuntimeService } from '../../../core/services/runtime.service';
import { CookiePolicyItComponent } from './cookie-policy-it.component';

describe('CookiePolicyItComponent — Italian /cookie-policy/it (#421)', () => {
  function setup(profile: RuntimeProfile = 'web') {
    TestBed.configureTestingModule({
      imports: [CookiePolicyItComponent],
      providers: [
        provideRouter([]),
        ...provideI18nTesting(),
        { provide: RuntimeService, useValue: { profile: signal(profile) } },
      ],
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
    expect(stamp?.textContent ?? '').toMatch(/2026-11-09/);
  });

  it('language toggle points back to the canonical English /cookie-policy', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const enLink = root.querySelector('[data-cy="cookie-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/cookie-policy');
    const active = root.querySelector('[data-cy="cookie-lang-toggle"] [aria-current="true"]');
    expect(active?.textContent?.trim()).toBe('Italiano');
  });

  it('cross-links to /privacy/it and /sub-processors/it', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a[routerLink="/privacy/it"]')).toBeTruthy();
    expect(root.querySelector('a[routerLink="/sub-processors/it"]')).toBeTruthy();
  });

  it('lists the same storage keys as the English page, no cookie among them (#1255)', () => {
    const { fixture } = setup('desktop');
    const root: HTMLElement = fixture.nativeElement;
    const keys = [...root.querySelectorAll('[data-cy="cookie-storage-keys"] tbody tr code')].map(
      (code) => code.textContent,
    );
    expect(keys).toEqual([
      'budojoLang',
      'budojoTheme',
      'budojoSyncLedger',
      'budojoSyncNamed',
      'documents.showCancelled',
      'auth_token',
      'budojoRestoredBackup',
      'budojo.reminders.told',
      'budojo-stale-chunk-reload-attempted',
    ]);
  });

  it('hides the consent section on the desktop, where no banner is mounted (#1508)', () => {
    const { fixture } = setup('desktop');
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-cy="cookie-policy-web-consent"]')).toBeNull();
    expect(root.querySelector('[data-cy="cookie-policy-manage"]')).toBeNull();
  });

  it('manage-preferences link reopens the banner via the consent service', () => {
    const { cmp } = setup();
    const consent = TestBed.inject(ConsentService);
    consent.acceptAll();
    expect(consent.decided()).toBe(true);
    cmp.managePreferences();
    expect(consent.decided()).toBe(false);
  });

  it('renders manage-preferences as a real <button>, not a javascript: anchor', () => {
    // Locks the keyboard-accessible control in place: a future refactor
    // back to `<a href="javascript:void(0)">` would silently break
    // assistive-tech semantics + strict-CSP environments. Mirrors the
    // EN spec's regression trip-wire so the two language variants stay
    // in lock-step.
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const manage = root.querySelector('[data-cy="cookie-policy-manage"]') as HTMLElement | null;
    expect(manage).not.toBeNull();
    expect(manage!.tagName).toBe('BUTTON');
    expect(manage!.getAttribute('type')).toBe('button');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
