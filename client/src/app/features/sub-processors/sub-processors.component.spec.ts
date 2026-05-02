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

  it('renders the header + the three current sub-processors', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.legal-page__title')?.textContent?.trim()).toBe('Sub-processors');

    // The current-sub-processors table must list the three vendors we
    // actually use today: Cloudflare, DigitalOcean, Forge. If a row
    // changes name or disappears, the test fails — forcing the audit
    // back through the CI gate.
    const text = root.textContent ?? '';
    expect(text).toContain('Cloudflare');
    expect(text).toContain('DigitalOcean');
    expect(text).toContain('Laravel Forge');

    const rows = root.querySelectorAll('[data-cy="sub-processors-current"] tbody tr');
    expect(rows.length).toBe(3);
  });

  it('CTA navigates back to the root', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
