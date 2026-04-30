import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PrivacyPolicyEnComponent } from './privacy-policy-en.component';

describe('PrivacyPolicyEnComponent (#273)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [PrivacyPolicyEnComponent],
      providers: [provideRouter([])],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(PrivacyPolicyEnComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the English title and the draft-status banner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Privacy Policy');

    const banner = root.querySelector('[data-cy="privacy-draft-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toContain('Technical draft');
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const stamp = root.querySelector('[data-cy="privacy-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Version/);
    expect(stamp?.textContent ?? '').toMatch(/2026-04-30/);
  });

  it('language toggle links back to the canonical Italian /privacy page', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="privacy-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const itLink = toggle?.querySelector('[data-cy="privacy-lang-it"]');
    expect(itLink?.getAttribute('routerLink')).toBe('/privacy');

    // The active language ("English") is rendered as a non-clickable
    // <strong> with aria-current — same shape as the IT page (#273).
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('English');
  });

  it('links to the canonical sub-processors page (already English-only)', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    const link = root.querySelector('a[routerLink="/sub-processors"], a[href="/sub-processors"]');
    expect(link).toBeTruthy();
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
