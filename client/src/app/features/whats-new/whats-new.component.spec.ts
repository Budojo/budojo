import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WhatsNewComponent } from './whats-new.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { LanguageService } from '../../core/services/language.service';
import { localised } from './whats-new.releases';

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

  // #1347 — the page chrome went through `| translate`, but the release copy is
  // data rather than template text and came out English for everyone. Not a
  // regression: it had been true since the page shipped.
  describe('release copy follows the chosen language', () => {
    // Anchored to a specific release rather than "the newest card". The first
    // version of these tests asserted on whatever was at the top, so they broke
    // on the very next release — a test that fails for being right is worse
    // than no test.
    function cardFor(fixture: ComponentFixture<WhatsNewComponent>, version: string): HTMLElement {
      const cards: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.whats-new__release'),
      );
      const card = cards.find(
        (el) => el.querySelector('.whats-new__version')?.textContent?.trim() === version,
      );

      expect(card, `no card for ${version}`).toBeTruthy();

      return card as HTMLElement;
    }

    it('renders the Italian copy when the app is in Italian', () => {
      const { fixture } = setup();
      TestBed.inject(LanguageService).currentLang.set('it');
      fixture.detectChanges();

      const card = cardFor(fixture, 'v2.45.0');

      expect(card.textContent).toContain('Ora vedi');
      expect(card.textContent).not.toContain('You can see the update happening');
    });

    it('renders the English copy when the app is in English', () => {
      const { fixture } = setup();
      TestBed.inject(LanguageService).currentLang.set('en');
      fixture.detectChanges();

      const card = cardFor(fixture, 'v2.45.0');

      expect(card.textContent).toContain('You can see the update happening');
    });

    // The mechanism, independent of any particular release: whatever sits at
    // the top must read differently in the two languages. This is the assertion
    // that keeps working when the newest entry changes.
    it('renders the newest release differently in each language', () => {
      const { fixture } = setup();
      const language = TestBed.inject(LanguageService);

      language.currentLang.set('en');
      fixture.detectChanges();
      const english = fixture.nativeElement.querySelector('.whats-new__release').textContent;

      language.currentLang.set('it');
      fixture.detectChanges();
      const italian = fixture.nativeElement.querySelector('.whats-new__release').textContent;

      expect(italian).not.toEqual(english);
    });
  });

  describe('localised', () => {
    // The 88 historical entries are bare strings and were not migrated. They
    // have to keep rendering — in both languages — or introducing the type
    // would have blanked most of the page.
    it('passes a plain string through in any language', () => {
      expect(localised('Plain English', 'it')).toBe('Plain English');
      expect(localised('Plain English', 'en')).toBe('Plain English');
    });

    it('falls back to English for a language it has no copy for', () => {
      // An untranslated note is still worth reading; the failure mode of a
      // missing translation should be a language switch, not a blank card.
      expect(localised({ en: 'English', it: 'Italiano' }, 'de')).toBe('English');
    });

    it('picks Italian when asked for it', () => {
      expect(localised({ en: 'English', it: 'Italiano' }, 'it')).toBe('Italiano');
    });
  });

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
    expect(firstRelease?.querySelector('.whats-new__version')?.textContent?.trim()).toBe('v2.49.0');
  });

  it('renders every shipped release in newest-first order', () => {
    const { fixture } = setup();
    const cards = fixture.nativeElement.querySelectorAll('.whats-new__release');
    expect(cards.length).toBe(92);

    // Pin every version in the order we ship them so a refactor that
    // accidentally reverses the array (e.g. a sort that reads ids
    // instead of dates) trips the test.
    const versions = Array.from(cards).map((el) =>
      (el as HTMLElement).querySelector('.whats-new__version')?.textContent?.trim(),
    );
    expect(versions).toEqual([
      'v2.49.0',
      'v2.48.0',
      'v2.47.0',
      'v2.46.0',
      'v2.45.0',
      'v2.44.0',
      'v2.43.0',
      'v2.42.2',
      'v2.42.1',
      'v2.42.0',
      'v2.41.0',
      'v2.40.1',
      'v2.40.0',
      'v2.39.3',
      'v2.39.2',
      'v2.39.1',
      'v2.39.0',
      'v2.38.1',
      'v2.38.0',
      'v2.37.0',
      'v2.36.0',
      'v2.35.0',
      'v2.34.0',
      'v2.33.0',
      'v2.32.2',
      'v2.32.1',
      'v2.32.0',
      'v2.31.1',
      'v2.31.0',
      'v2.30.0',
      'v2.29.0',
      'v2.28.1',
      'v2.28.0',
      'v2.27.0',
      'v2.26.1',
      'v2.26.0',
      'v2.25.1',
      'v2.25.0',
      'v2.24.0',
      'v2.23.0',
      'v2.22.1',
      'v2.22.0',
      'v2.21.0',
      'v2.20.0',
      'v2.19.0',
      'v2.18.4',
      'v2.18.3',
      'v2.18.2',
      'v2.18.1',
      'v2.18.0',
      'v2.17.0',
      'v2.16.0',
      'v2.15.0',
      'v2.14.0',
      'v2.13.0',
      'v2.12.0',
      'v2.11.0',
      'v2.10.1',
      'v2.10.0',
      'v2.9.0',
      'v2.8.0',
      'v2.7.0',
      'v2.6.1',
      'v2.6.0',
      'v2.5.0',
      'v2.4.0',
      'v2.3.2',
      'v2.3.1',
      'v2.3.0',
      'v2.2.0',
      'v2.1.0',
      'v2.0.0',
      'v1.19.0',
      'v1.18.0',
      'v1.17.0',
      'v1.16.0',
      'v1.15.0',
      'v1.14.3',
      'v1.14.2',
      'v1.14.1',
      'v1.14.0',
      'v1.13.0',
      'v1.12.0',
      'v1.11.0',
      'v1.10.0',
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
