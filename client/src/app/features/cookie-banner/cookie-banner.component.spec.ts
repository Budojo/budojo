import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { CONSENT_STORAGE_KEY, ConsentService } from '../../core/services/consent.service';
import { CookieBannerComponent } from './cookie-banner.component';

/**
 * CookieBannerComponent unit tests (#421).
 *
 * Covers the three banner CTAs (accept / reject / customise) plus the
 * persistence trip-wire — after each path the localStorage payload
 * matches what the analytics gate will read at next bootstrap.
 *
 * The Customise dialog body is rendered into the document via PrimeNG's
 * append target; assertions look for the per-category data-cy hooks
 * directly on the document (not just the host element).
 */
describe('CookieBannerComponent (#421)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [CookieBannerComponent],
      providers: [provideRouter([]), provideAnimationsAsync(), ...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(CookieBannerComponent);
    fixture.detectChanges();
    return {
      fixture,
      cmp: fixture.componentInstance,
      consent: TestBed.inject(ConsentService),
    };
  }

  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('renders the sticky banner on first visit', () => {
    const { fixture } = setup();
    const banner = fixture.nativeElement.querySelector('[data-cy="cookie-banner"]');
    expect(banner).toBeTruthy();
  });

  it('exposes the banner as a named region landmark (no role="dialog")', () => {
    // The banner is non-modal — no focus trap, no escape handling — so
    // it MUST NOT claim dialog semantics. role="region" + aria-label is
    // the honest landmark; this assertion locks the contract so a future
    // refactor can't silently regress to role="dialog".
    const { fixture } = setup();
    const banner = fixture.nativeElement.querySelector('[data-cy="cookie-banner"]') as HTMLElement;
    expect(banner.getAttribute('role')).toBe('region');
    expect(banner.getAttribute('aria-label')).toBeTruthy();
    expect(banner.getAttribute('aria-modal')).toBeNull();
  });

  it('hides the banner once a decision exists in storage', () => {
    // Arrange: a current-version payload so hydrate() flips decided=true
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        choices: { essential: true, preferences: false, analytics: false, marketing: false },
        savedAt: '2026-04-30T00:00:00.000Z',
      }),
    );
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('[data-cy="cookie-banner"]')).toBeNull();
  });

  it('Accept all → service decided + every non-essential category on', () => {
    const { fixture, consent } = setup();
    const button = fixture.nativeElement.querySelector(
      '[data-cy="cookie-banner-accept"] button',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    button?.click();
    fixture.detectChanges();
    expect(consent.decided()).toBe(true);
    expect(consent.choices().analytics).toBe(true);
    expect(consent.choices().marketing).toBe(true);
    expect(consent.choices().preferences).toBe(true);
    // Banner unmounted on the next render
    expect(fixture.nativeElement.querySelector('[data-cy="cookie-banner"]')).toBeNull();
  });

  it('Reject non-essential → service decided + only essential on', () => {
    const { fixture, consent } = setup();
    const button = fixture.nativeElement.querySelector(
      '[data-cy="cookie-banner-reject"] button',
    ) as HTMLButtonElement | null;
    button?.click();
    fixture.detectChanges();
    expect(consent.decided()).toBe(true);
    expect(consent.choices()).toEqual({
      essential: true,
      preferences: false,
      analytics: false,
      marketing: false,
    });
    expect(fixture.nativeElement.querySelector('[data-cy="cookie-banner"]')).toBeNull();
  });

  it('Customise opens the dialog with all four categories listed', () => {
    const { fixture, cmp } = setup();
    cmp.openCustomise();
    fixture.detectChanges();

    // p-dialog renders into document.body; query at document scope
    const root = fixture.nativeElement.ownerDocument as Document;
    expect(root.querySelector('[data-cy="cookie-category-essential"]')).toBeTruthy();
    expect(root.querySelector('[data-cy="cookie-category-preferences"]')).toBeTruthy();
    expect(root.querySelector('[data-cy="cookie-category-analytics"]')).toBeTruthy();
    expect(root.querySelector('[data-cy="cookie-category-marketing"]')).toBeTruthy();
  });

  it('Customise → save persists exactly the toggled categories (essential cannot be turned off)', () => {
    const { fixture, cmp, consent } = setup();
    cmp.openCustomise();
    // Programmatic flips on the draft signal mirror what the
    // checkbox `(ngModelChange)` would do at runtime — the assertion
    // is on the persisted payload after Save.
    cmp['setDraft']('preferences', true);
    cmp['setDraft']('analytics', true);
    cmp['setDraft']('marketing', false);
    cmp.saveCustomise();
    fixture.detectChanges();

    expect(consent.decided()).toBe(true);
    expect(consent.choices()).toEqual({
      essential: true,
      preferences: true,
      analytics: true,
      marketing: false,
    });
    // Persistence trip-wire — the analytics gate at next session
    // reads this payload, not the in-memory signal.
    const persisted = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) as string);
    expect(persisted.choices).toEqual(consent.choices());
  });

  it('setDraft ignores attempts to flip the locked essential category off', () => {
    const { cmp } = setup();
    cmp['setDraft']('essential', false);
    expect(cmp['getDraft']('essential')).toBe(true);
  });

  it('reopen() re-shows the banner after a decision was already made', () => {
    const { fixture, consent } = setup();
    consent.acceptAll();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="cookie-banner"]')).toBeNull();

    consent.reopen();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="cookie-banner"]')).toBeTruthy();
  });
});
