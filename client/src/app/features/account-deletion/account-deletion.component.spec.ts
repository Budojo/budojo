import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { AccountDeletionComponent } from './account-deletion.component';

describe('AccountDeletionComponent — canonical English /account-deletion (#688)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AccountDeletionComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(AccountDeletionComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the English page title', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Account deletion');
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const stamp = root.querySelector('[data-cy="account-deletion-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Version/);
    expect(stamp?.textContent ?? '').toMatch(/2026-05-13/);
  });

  it('language toggle points to the Italian translation', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="account-deletion-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const itLink = toggle?.querySelector('[data-cy="account-deletion-lang-it"]');
    expect(itLink?.getAttribute('routerLink')).toBe('/account-deletion/it');

    // Active language ("English") rendered as non-clickable <strong>
    // with aria-current — mirror of the /privacy page toggle.
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('English');
  });

  it('surfaces the privacy mailbox as the canonical request channel', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const mailto = root.querySelector('a[href="mailto:privacy@budojo.it"]');
    expect(mailto).toBeTruthy();
  });

  it('states the 30-day grace window for the Play Store reviewer to audit', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('30');
    expect(text.toLowerCase()).toContain('grace');
  });

  it('cross-links to the privacy policy so the chain stays auditable', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const link = root.querySelector('a[routerLink="/privacy"]');
    expect(link).toBeTruthy();
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
