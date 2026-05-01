import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NotFoundComponent } from './not-found.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

describe('NotFoundComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      providers: [
        ...provideI18nTesting(),
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the brand glyph + (English-default) title + message', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('app-brand-glyph')).not.toBeNull();
    // i18n now drives the copy — the JSON `notFound.title` value is
    // pinned by the test harness's English translations, the IT
    // version was the *previous* hardcoded text and has moved into
    // it.json for users toggling to Italian (#278).
    expect(root.querySelector('.not-found__title')?.textContent?.trim()).toBe('Page not found');
    expect(root.querySelector('.not-found__message')?.textContent).toContain(
      "doesn't match any page",
    );
  });

  it('CTA navigates to /dashboard/athletes — the dashboard guards do the rest', () => {
    const { cmp } = setup();
    const router = TestBed.inject(Router);

    cmp.goHome();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/athletes');
  });
});
