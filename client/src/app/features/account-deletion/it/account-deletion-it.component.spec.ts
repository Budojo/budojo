import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AccountDeletionItComponent } from './account-deletion-it.component';

describe('AccountDeletionItComponent — Italian /account-deletion/it (#688)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AccountDeletionItComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(AccountDeletionItComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the Italian page title', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe(
      "Cancellazione dell'account",
    );
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const stamp = root.querySelector('[data-cy="account-deletion-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Versione/);
    expect(stamp?.textContent ?? '').toMatch(/2026-11-09/);
  });

  it('language toggle points back to the canonical English /account-deletion', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="account-deletion-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const enLink = toggle?.querySelector('[data-cy="account-deletion-lang-en"]');
    expect(enLink?.getAttribute('routerLink')).toBe('/account-deletion');

    // Active language ("Italiano") rendered as non-clickable <strong>
    // with aria-current — mirror of the /privacy/it page toggle.
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('Italiano');
  });

  it('keeps the privacy mailbox for questions about the software', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const mailto = root.querySelector('a[href="mailto:privacy@budojo.it"]');
    expect(mailto).toBeTruthy();
  });

  it('says in Italian there is no server account and where the data really is (#1255)', () => {
    const { fixture } = setup();
    // Whitespace collapsed: the template wraps prose wherever prettier likes.
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain("Non c'è un account Budojo da chiudere");
    expect(text).toContain('%APPDATA%\\Budojo\\');
    expect(text).toContain('Disinstallare non la tocca');
    expect(text).not.toContain('30 giorni');
  });

  it('cross-links to the Italian privacy policy (legal source of truth)', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const link = root.querySelector('a[routerLink="/privacy/it"]');
    expect(link).toBeTruthy();
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
