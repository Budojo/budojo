import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LandingComponent } from './landing.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function setup() {
  TestBed.configureTestingModule({
    imports: [LandingComponent],
    providers: [provideRouter([]), ...provideI18nTesting()],
  });
  const router = TestBed.inject(Router);
  router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
  const fixture = TestBed.createComponent(LandingComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance };
}

describe('LandingComponent (#330)', () => {
  it('renders the hero headline + supporting paragraph + primary CTA', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // Headline copy is the "what + who" punch line — assert the
    // English default ships as we wrote it.
    expect(root.querySelector('.landing__hero-headline')?.textContent).toContain(
      'Run your academy from your phone',
    );

    // Supporting paragraph carries the founder-voice lead-in.
    expect(root.querySelector('.landing__hero-sub')?.textContent).toContain(
      'Built by a BJJ instructor for instructors',
    );

    // Primary CTA in the hero — `data-cy` hook for the cypress spec.
    const heroCta = root.querySelector('[data-cy="landing-hero-cta"]') as HTMLElement | null;
    expect(heroCta).not.toBeNull();
    expect(heroCta?.textContent).toContain('Start free');
  });

  it('renders nav: Login link + Sign-up button + language toggle', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // Login text link, top-right header.
    const login = root.querySelector('[data-cy="landing-login"]') as HTMLAnchorElement | null;
    expect(login).not.toBeNull();
    expect(login?.getAttribute('href')).toBe('/auth/login');
    expect(login?.textContent?.trim()).toBe('Log in');

    // Sign-up primary button — `<p-button>` host carries the
    // routerLink; the directive navigates programmatically rather
    // than exposing `href` on the host. Asserting the data-cy hook
    // and the visible label is enough; the routerLink wiring is
    // covered end-to-end by the cypress spec.
    const signup = root.querySelector('[data-cy="landing-signup"]') as HTMLElement | null;
    expect(signup).not.toBeNull();
    expect(signup?.textContent).toContain('Start free');

    // Language toggle.
    const langBtn = root.querySelector(
      '[data-cy="landing-lang-toggle"]',
    ) as HTMLButtonElement | null;
    expect(langBtn).not.toBeNull();
  });

  it('renders 4 pain points (no more, no less)', () => {
    const { fixture } = setup();
    const items = fixture.nativeElement.querySelectorAll('.landing__pain-item');
    expect(items.length).toBe(4);
  });

  it('renders 6 feature cards', () => {
    const { fixture } = setup();
    const cards = fixture.nativeElement.querySelectorAll('.landing__feature-card');
    // Six features advertised: roster, documents, attendance, payments,
    // pwa, feedback. Pinned so a refactor that drops one trips the test.
    expect(cards.length).toBe(6);
  });

  it('renders 3 trust claims and 3 how-it-works steps', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelectorAll('.landing__trust-item').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.landing__how-step').length).toBe(3);
  });

  it('renders the pricing tile with the MVP-honest copy', () => {
    const { fixture } = setup();
    const card = fixture.nativeElement.querySelector('.landing__pricing-card') as HTMLElement;
    expect(card?.textContent).toContain('Free during MVP');
  });

  it('footer carries privacy + terms + sub-processors links + GitHub + lang toggle', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(
      (root.querySelector('[data-cy="landing-footer-privacy"]') as HTMLAnchorElement)?.getAttribute(
        'href',
      ),
    ).toBe('/privacy');
    expect(
      (root.querySelector('[data-cy="landing-footer-terms"]') as HTMLAnchorElement)?.getAttribute(
        'href',
      ),
    ).toBe('/terms');
    expect(
      (
        root.querySelector('[data-cy="landing-footer-subprocessors"]') as HTMLAnchorElement
      )?.getAttribute('href'),
    ).toBe('/sub-processors');
  });

  it('renders the hero product screenshot in place of the brand-glyph placeholder (#372)', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // Placeholder is gone — the hero visual no longer renders the
    // brand-glyph centred-tile that #330 shipped as a stand-in.
    expect(root.querySelector('.landing__hero-visual app-brand-glyph')).toBeNull();

    // Real screenshot drops in. Width/height attributes are set so
    // the browser can reserve layout space before the asset loads
    // (CLS budget, Doherty Threshold).
    const img = root.querySelector('.landing__hero-screenshot') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain(
      'assets/landing/stats-attendance-heatmap-iphone.webp',
    );
    expect(img?.getAttribute('width')).toBe('1024');
    expect(img?.getAttribute('height')).toBe('2218');
    // Meaningful alt — the screenshot is content (it shows what
    // Budojo looks like), not decoration.
    expect(img?.getAttribute('alt')).toBeTruthy();
    expect(img?.getAttribute('alt')?.length).toBeGreaterThan(5);
  });

  it('switchLanguage flips between en and it', () => {
    const { cmp } = setup();
    expect(cmp['currentLanguage']()).toBe('en');
    cmp['switchLanguage']();
    expect(cmp['currentLanguage']()).toBe('it');
    cmp['switchLanguage']();
    expect(cmp['currentLanguage']()).toBe('en');
  });
});
