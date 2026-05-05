import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { TermsItComponent } from './terms-it.component';

describe('TermsItComponent — Italian /terms/it (#420)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [TermsItComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(TermsItComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the Italian title and the placeholder banner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe(
      'Termini di Servizio',
    );

    const banner = root.querySelector('[data-cy="terms-placeholder-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toContain('segnaposto');
  });

  it('language toggle links back to the canonical English /terms', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="terms-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const enLink = toggle?.querySelector('[data-cy="terms-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/terms');

    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('Italiano');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
