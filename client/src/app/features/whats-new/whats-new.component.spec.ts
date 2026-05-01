import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WhatsNewComponent } from './whats-new.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

describe('WhatsNewComponent (#254)', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [WhatsNewComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = vi.fn().mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the title and the latest release at the top', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.whats-new__title')?.textContent?.trim()).toBe('Recent updates');

    // Newest-first ordering is part of the contract — a user opening
    // the page wants to see what changed THIS week before scrolling.
    // We assert the first .whats-new__release card carries the latest
    // version we've shipped; when we ship a new version and forget
    // to prepend instead of append, this fails.
    const firstRelease = root.querySelector('.whats-new__release');
    expect(firstRelease?.querySelector('.whats-new__version')?.textContent?.trim()).toBe('v1.9.0');
  });

  it('renders every shipped release in newest-first order', () => {
    const { fixture } = setup();
    const cards = fixture.nativeElement.querySelectorAll('.whats-new__release');
    expect(cards.length).toBe(7);

    // Pin every version in the order we ship them so a refactor that
    // accidentally reverses the array (e.g. a sort that reads ids
    // instead of dates) trips the test.
    const versions = Array.from(cards).map((el) =>
      (el as HTMLElement).querySelector('.whats-new__version')?.textContent?.trim(),
    );
    expect(versions).toEqual([
      'v1.9.0',
      'v1.8.0',
      'v1.7.0',
      'v1.6.0',
      'v1.5.0',
      'v1.4.0',
      'v1.3.0',
    ]);
  });

  it('the v1.6.0 card carries the four advertised sections', () => {
    const { fixture } = setup();
    const v160 = fixture.nativeElement.querySelector(
      '[data-cy="whats-new-release-v1.6.0"]',
    ) as HTMLElement | null;
    expect(v160).toBeTruthy();

    // Section count + their headings — spot-check that the release
    // entry hasn't been silently truncated by a future template
    // refactor. Emoji-led headings are part of the user-facing UX
    // (light, friendly), so they're load-bearing in the assertion.
    const headings = Array.from(v160!.querySelectorAll('.whats-new__section-heading')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual([
      '🛡️ Privacy & data control',
      '🥋 Athletes & belts',
      '📱 Mobile fixes',
      '🧹 Behind the scenes',
    ]);
  });

  it('CTA navigates back to the dashboard', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });
});
