import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      providers: [
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the brand glyph + Italian title + message', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('app-brand-glyph')).not.toBeNull();
    expect(root.querySelector('.not-found__title')?.textContent?.trim()).toBe('Pagina non trovata');
    expect(root.querySelector('.not-found__message')?.textContent).toContain(
      "L'indirizzo non corrisponde",
    );
  });

  it('CTA navigates to /dashboard/athletes — the dashboard guards do the rest', () => {
    const { cmp } = setup();
    const router = TestBed.inject(Router);

    cmp.goHome();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/athletes');
  });
});
