import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PrivacyPolicyComponent } from './privacy-policy.component';

describe('PrivacyPolicyComponent (#219)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [PrivacyPolicyComponent],
      providers: [
        // Same wiring as SubProcessorsComponent — RouterLink directives
        // need a real Router in the injector or they crash on bind. We
        // patch navigateByUrl AFTER provideRouter populates it.
        provideRouter([]),
      ],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(PrivacyPolicyComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the page title and the draft-status banner', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe(
      'Informativa sulla Privacy',
    );

    // The draft banner is a load-bearing UX signal: without it a regulator
    // or user would assume the legal text is final. The presence of an
    // explicit "bozza" label is part of the in-good-faith interim
    // disclosure strategy until the lawyer-reviewed copy lands.
    const banner = root.querySelector('[data-cy="privacy-draft-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent ?? '').toContain('Bozza');
  });

  it('exposes a version + last-updated stamp at the bottom', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // GDPR Art. 13 + Garante guidance: the user must be able to see
    // which version of the policy they're reading, so a change can be
    // identified after the fact.
    const stamp = root.querySelector('[data-cy="privacy-version-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.textContent ?? '').toMatch(/Versione/);
    expect(stamp?.textContent ?? '').toMatch(/2026-04-30/);
  });

  it('links to the canonical sub-processor list and the cookie audit', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const subprocessorLink = root.querySelector(
      'a[routerLink="/sub-processors"], a[href="/sub-processors"]',
    );
    expect(subprocessorLink).toBeTruthy();

    // Cookie audit is a markdown-only doc today, so the inline link is
    // an external href to the GitHub-rendered file in this repo. We
    // only assert the SPA carries SOME pointer to "Cookie" content —
    // the exact URL can change once the audit gets its own SPA route.
    const text = root.textContent ?? '';
    expect(text).toContain('cookie');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
