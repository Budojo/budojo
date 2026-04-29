import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SubProcessorsComponent } from './sub-processors.component';

describe('SubProcessorsComponent (#225)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [SubProcessorsComponent],
      providers: [
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
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
