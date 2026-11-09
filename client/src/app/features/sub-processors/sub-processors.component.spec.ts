import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { SubProcessorsComponent } from './sub-processors.component';

describe('SubProcessorsComponent (#225)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [SubProcessorsComponent],
      providers: [
        // The component template uses `routerLink="/"` for the brand
        // mark, which only resolves with a real Router instance in the
        // injector tree. `provideRouter([])` gives us the lightest-weight
        // wiring (no actual routes, no test bed setup ceremony) — the
        // navigateByUrl call we assert on is mocked below by overriding
        // the same Router AFTER provideRouter populated it.
        provideRouter([]),
        ...provideI18nTesting(),
      ],
    });
    // Spy on navigateByUrl on the live Router instance — overriding the
    // provider via { provide: Router, useValue: ... } would crash the
    // RouterLink directive on construction. Patching the method post-
    // setup keeps both the directive happy AND lets us assert on the
    // CTA navigation.
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(SubProcessorsComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the header + the three third parties the app contacts (#1255)', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Sub-processors');

    // Budojo has no sub-processors since the hosted stack was shut down
    // (#1230). The table must list exactly the third parties the local
    // app contacts: Google, GitHub, and the sites behind the links the
    // owner opens. If a row changes name or disappears, the test fails,
    // forcing the audit back through the CI gate.
    const rows = [
      ...root.querySelectorAll('[data-cy="sub-processors-third-parties"] tbody tr'),
    ].map((row) => (row.querySelector('td')?.textContent ?? '').replace(/\s+/g, ' '));
    expect(rows.length).toBe(3);
    expect(rows[0]).toContain('Google');
    expect(rows[1]).toContain('GitHub');
    expect(rows[2]).toContain('links the owner opens');
  });

  it('language toggle points to the Italian /sub-processors/it (#280)', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    const toggle = root.querySelector('[data-cy="sub-processors-lang-toggle"]');
    expect(toggle).toBeTruthy();

    const itLink = toggle?.querySelector('[data-cy="sub-processors-lang-it"]');
    expect(itLink?.getAttribute('routerLink')).toBe('/sub-processors/it');

    // Active language ("English") rendered as non-clickable <strong>
    // with aria-current — mirror of the /privacy page toggle (#291).
    const activeMarker = toggle?.querySelector('[aria-current="true"]');
    expect(activeMarker?.textContent?.trim()).toBe('English');
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
