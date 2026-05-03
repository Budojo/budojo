import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { PrivacyPolicyItComponent } from './privacy-policy-it.component';

describe('PrivacyPolicyItComponent — Italian /privacy/it (#291)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [PrivacyPolicyItComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(PrivacyPolicyItComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the Italian page title and the draft-status banner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe(
      'Informativa sulla Privacy',
    );

    const banner = root.querySelector('[data-cy="privacy-draft-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toContain('Bozza');
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const stamp = root.querySelector('[data-cy="privacy-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Versione/);
    expect(stamp?.textContent ?? '').toMatch(/2026-04-30/);
  });

  it('language toggle points to the canonical English /privacy', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="privacy-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const enLink = toggle?.querySelector('[data-cy="privacy-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/privacy');

    // Active language ("Italiano") rendered as non-clickable <strong>
    // with aria-current — mirror of the /privacy page toggle.
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('Italiano');
  });

  it('links to the canonical sub-processor list and the cookie audit', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const subprocessorLink = root.querySelector(
      'a[routerLink="/sub-processors"], a[href="/sub-processors"]',
    );
    expect(subprocessorLink).toBeTruthy();

    const text = root.textContent ?? '';
    expect(text).toContain('cookie');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
