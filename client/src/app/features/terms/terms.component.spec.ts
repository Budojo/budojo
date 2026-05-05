import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { TermsComponent } from './terms.component';

describe('TermsComponent — canonical English /terms (#420)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [TermsComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(TermsComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the English title and the placeholder banner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Terms of Service');

    const banner = root.querySelector('[data-cy="terms-placeholder-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toContain('Placeholder');
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const stamp = root.querySelector('[data-cy="terms-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Version/);
    expect(stamp?.textContent ?? '').toMatch(/2026-05-05/);
  });

  it('language toggle points to the Italian translation at /terms/it', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="terms-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const itLink = toggle?.querySelector('[data-cy="terms-lang-it"]');
    expect(itLink?.getAttribute('routerLink')).toBe('/terms/it');

    // Active language ("English") rendered as non-clickable <strong>
    // with aria-current — same shape as the /privacy page.
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('English');
  });

  it('cross-links to the privacy policy', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const link = root.querySelector('a[routerLink="/privacy"], a[href="/privacy"]');
    expect(link).toBeTruthy();
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
