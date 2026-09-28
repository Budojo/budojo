import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WhatsNewComponent } from './whats-new.component';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { LanguageService } from '../../core/services/language.service';
import { localised, RELEASES } from './whats-new.releases';

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
    //
    // ...and then it broke anyway, once, on v2.55.0: #1464 made the page open
    // on ten releases, and the anchor eventually falls past the tenth. So the
    // lookup presses "show more" until it finds the card or runs out of
    // history, which keeps the anchor stable without pinning it to a position.
    function cardFor(fixture: ComponentFixture<WhatsNewComponent>, version: string): HTMLElement {
      const find = (): HTMLElement | undefined =>
        Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.whats-new__release')).find(
          (el) => el.querySelector('.whats-new__version')?.textContent?.trim() === version,
        );

      let card = find();
      while (!card) {
        const more = fixture.nativeElement.querySelector(
          '[data-cy="whats-new-more"]',
        ) as HTMLButtonElement | null;
        if (!more) break;
        more.click();
        fixture.detectChanges();
        card = find();
      }

      expect(card, `no card for ${version} anywhere in the history`).toBeTruthy();

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
    expect(firstRelease?.querySelector('.whats-new__version')?.textContent?.trim()).toBe(
      RELEASES[0].version,
    );
  });

  it('opens on ten releases, with the rest a press away (#1464)', () => {
    // 95 cards at once buried the entry anyone came for under everything
    // that came before it.
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelectorAll('.whats-new__release').length).toBe(10);

    const more = root.querySelector('[data-cy="whats-new-more"]') as HTMLButtonElement;
    expect(more).not.toBeNull();
    expect(more.textContent).toContain(String(RELEASES.length - 10));

    more.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.whats-new__release').length).toBe(20);
  });

  it('renders every shipped release in newest-first order', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // Expand fully first — the trip-wire is about ORDER and COUNT across the
    // whole history, and #1464 made the page open on ten. Pressing until the
    // button goes keeps the guarantee this test has always given.
    for (let i = 0; i < 20; i++) {
      const more = root.querySelector('[data-cy="whats-new-more"]') as HTMLButtonElement | null;
      if (!more) break;
      more.click();
      fixture.detectChanges();
    }
    expect(root.querySelector('[data-cy="whats-new-more"]')).toBeNull();

    const cards = fixture.nativeElement.querySelectorAll('.whats-new__release');
    expect(cards.length).toBe(RELEASES.length);

    // Pin every version in the order we ship them so a refactor that
    // accidentally reverses the array (e.g. a sort that reads ids
    // instead of dates) trips the test.
    const versions = Array.from(cards).map((el) =>
      (el as HTMLElement).querySelector('.whats-new__version')?.textContent?.trim(),
    );
    expect(versions).toEqual(RELEASES.map((r) => r.version));
  });

  it('keeps its releases newest-first, so a release appended at the bottom fails', () => {
    // The pins this replaces were bumped by hand on every release (#2020).
    // The release PR's own CI job checks the head entry is the version
    // semantic-release will tag; this checks everything below it is older.
    const semver = (v: string): number[] => v.replace(/^v/, '').split('.').map(Number);
    const newer = (a: string, b: string): boolean => {
      const [x, y] = [semver(a), semver(b)];
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
      return false;
    };
    const outOfOrder = RELEASES.slice(1).filter(
      (release, i) => !newer(RELEASES[i].version, release.version),
    );

    expect(outOfOrder.map((r) => r.version)).toEqual([]);
  });

  it('the v1.6.0 card carries the four advertised sections', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement;

    // v1.6.0 is far down the history, and the page opens on ten (#1464), so
    // it has to be revealed before it can be inspected.
    for (let i = 0; i < 20; i++) {
      const more = root.querySelector('[data-cy="whats-new-more"]') as HTMLButtonElement | null;
      if (!more) break;
      more.click();
      fixture.detectChanges();
    }

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
      'Privacy & data control',
      'Athletes & belts',
      'Mobile fixes',
      'Behind the scenes',
    ]);
  });

  it('CTA navigates back to the dashboard', () => {
    const { cmp } = setup();
    cmp.goHome();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });
});

describe('no emoji in the release notes (#1659)', () => {
  it('leaves every section heading without a glyph', () => {
    // The content voice rule is "no emoji in product UI", and the release
    // notes are product UI. They rendered as tofu wherever no emoji font is
    // installed, and as colour pictographs where one is — neither is the
    // typography the rest of the app uses.
    // Base pictographs only. A variation selector, a zero-width joiner or a
    // skin-tone modifier never appears without one, and putting them in a
    // character class is what `no-misleading-character-class` forbids.
    // No \u2190-\u21FF: that block is typographic arrows, and "Profilo" →
    // "Impostazioni" is prose, not decoration.
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

    const offenders = RELEASES.flatMap((release) =>
      release.sections
        .flatMap((section) =>
          typeof section.heading === 'string'
            ? [section.heading]
            : [section.heading.en, section.heading.it],
        )
        .filter((heading) => EMOJI.test(heading))
        .map((heading) => `${release.version}: ${heading}`),
    );

    expect(offenders).toEqual([]);
  });

  it('writes plain text — the page renders no markdown, so ** would show as asterisks', () => {
    // v2.64.0 shipped its bullets with **bold** markers the card printed
    // verbatim; the markdown changelog file is where bold belongs.
    const texts = RELEASES.flatMap((release) =>
      [release.headline, ...release.sections.flatMap((s) => [s.heading, ...s.bullets])]
        .flatMap((value) => (typeof value === 'string' ? [value] : [value.en, value.it]))
        .map((text) => ({ version: release.version, text })),
    );

    const offenders = texts.filter(({ text }) => text.includes('**')).map(({ version }) => version);
    expect([...new Set(offenders)]).toEqual([]);
  });
});
