import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { SubProcessorsItComponent } from './sub-processors-it.component';

describe('SubProcessorsItComponent — Italian /sub-processors/it (#280)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [SubProcessorsItComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(SubProcessorsItComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the Italian page title and the three current sub-processors', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Sub-processor');

    // Same vendor list as the English page — pinning all three names so a
    // drift between EN and IT (or a vendor change) trips the test.
    const text = root.textContent ?? '';
    expect(text).toContain('Cloudflare');
    expect(text).toContain('DigitalOcean');
    expect(text).toContain('Laravel Forge');

    const rows = root.querySelectorAll('[data-cy="sub-processors-current"] tbody tr');
    expect(rows.length).toBe(3);
  });

  it('language toggle points to the canonical English /sub-processors', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="sub-processors-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const enLink = toggle?.querySelector('[data-cy="sub-processors-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/sub-processors');

    // Active language ("Italiano") rendered as non-clickable <strong>
    // with aria-current — mirror of the /privacy{,/it} page toggle.
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('Italiano');
  });

  it('related-documents links to the Italian privacy page', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const privacyLink = root.querySelector('[data-cy="sub-processors-it-privacy-link"]');
    expect(privacyLink?.getAttribute('routerLink')).toBe('/privacy/it');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
