import { Component, DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { BeltBadgeComponent } from './belt-badge.component';
import { Belt } from '../../../core/services/athlete.service';
import type { MartialArt } from '../../../core/services/academy.service';
import { useLadder } from '../../../../test-utils/ladder-test';

@Component({
  imports: [BeltBadgeComponent],
  template: `<app-belt-badge [belt]="belt" [stripes]="stripes" [appearance]="appearance" />`,
})
class HostComponent {
  belt: Belt = 'white';
  stripes = 0;
  appearance: 'badge' | 'spine' = 'badge';
}

/** Configures the module, loads an academy teaching `art`, renders the badge. */
function setup(
  art: MartialArt,
  inputs: Partial<Pick<HostComponent, 'belt' | 'stripes' | 'appearance'>>,
): DebugElement {
  TestBed.configureTestingModule({
    imports: [BeltBadgeComponent, HostComponent],
    providers: [...provideI18nTesting()],
  });
  useLadder(art);
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, inputs);
  fixture.detectChanges();
  return fixture.debugElement.query((el) => el.name === 'app-belt-badge');
}

function labelOf(badge: DebugElement): string | undefined {
  return (badge.nativeElement as HTMLElement)
    .querySelector('.belt-badge__label')
    ?.textContent?.trim();
}

/** A caller with no count to show — a feed flair, a promotion's from/to belt. */
@Component({
  imports: [BeltBadgeComponent],
  template: `<app-belt-badge [belt]="belt" />`,
})
class CountlessHostComponent {
  belt: Belt = 'black';
}

/** A ghost promotion row's badge (#1966): the stripes it has, and the one it is missing. */
@Component({
  imports: [BeltBadgeComponent],
  template: `<app-belt-badge [belt]="belt" [stripes]="stripes" [missingStripe]="true" />`,
})
class MissingStripeHostComponent {
  belt: Belt = 'white';
  stripes = 3;
}

function setupMissing(art: MartialArt, belt: Belt, stripes: number): HTMLElement {
  TestBed.configureTestingModule({
    imports: [BeltBadgeComponent, MissingStripeHostComponent],
    providers: [...provideI18nTesting()],
  });
  useLadder(art);
  const fixture = TestBed.createComponent(MissingStripeHostComponent);
  Object.assign(fixture.componentInstance, { belt, stripes });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('BeltBadgeComponent', () => {
  describe('the missing stripe (#1966)', () => {
    afterEach(() => TestBed.resetTestingModule());

    it('draws the next stripe as an empty tile after the filled ones', () => {
      const el = setupMissing('bjj', 'white', 3);
      expect(el.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(3);
      expect(el.querySelectorAll('[data-cy="belt-stripe-missing"]').length).toBe(1);
    });

    it('draws it even on a belt with no stripe yet', () => {
      const el = setupMissing('bjj', 'blue', 0);
      expect(el.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(0);
      expect(el.querySelector('[data-cy="belt-stripe-missing"]')).not.toBeNull();
    });

    it('draws none where the grade is full, or where it counts dan', () => {
      expect(
        setupMissing('bjj', 'white', 4).querySelector('[data-cy="belt-stripe-missing"]'),
      ).toBeNull();
      TestBed.resetTestingModule();
      expect(
        setupMissing('judo', 'black', 1).querySelector('[data-cy="belt-stripe-missing"]'),
      ).toBeNull();
    });
  });

  it('renders the belt name via the shared i18n key', () => {
    TestBed.configureTestingModule({
      imports: [BeltBadgeComponent, HostComponent],
      providers: [...provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.belt = 'blue';
    fixture.detectChanges();

    const badge = fixture.debugElement.query((el) => el.name === 'app-belt-badge');
    expect(badge.componentInstance.labelKey()).toBe('belts.blue');
    // Rendered text is the EN translation in the test default locale —
    // confirms the pipe wires through to the shared `belts.*` namespace.
    const label = fixture.nativeElement.querySelector('.belt-badge__label') as HTMLElement | null;
    expect(label?.textContent?.trim()).toBe('Blue');
  });

  it.each<[Belt, string]>([
    ['white', 'white'],
    ['blue', 'blue'],
    ['green', 'green'],
    ['black', 'black'],
    ['red', 'red'],
  ])('paints %s from the one palette, text in its own ink', (belt, colour) => {
    const badge = setup('bjj', { belt });
    const style = badge.componentInstance.style();
    expect(style['background']).toBe(`var(--budojo-belt-${colour})`);
    expect(style['color']).toBe(`var(--budojo-belt-${colour}-ink)`);
  });

  it.each<[Belt, string, string]>([
    ['red-and-black', 'red', 'black'],
    ['white-and-yellow', 'white', 'yellow'],
    ['black-and-red', 'black', 'red'],
  ])(
    'paints two-colour %s as its main colour with a band of the second (#1801)',
    (belt, main, tip) => {
      // No single ink reads on both halves of every pair (yellow-and-orange
      // has none at 4.5:1), so the text sits on the main colour only.
      const badge = setup('taekwondo', { belt });
      const style = badge.componentInstance.style();
      expect(style['background']).toBe(
        `linear-gradient(90deg, var(--budojo-belt-${main}) 0 calc(100% - var(--budojo-belt-band)), var(--budojo-belt-${tip}) calc(100% - var(--budojo-belt-band)) 100%)`,
      );
      expect(style['color']).toBe(`var(--budojo-belt-${main}-ink)`);
      expect((badge.nativeElement as HTMLElement).classList).toContain('belt-badge--two-tone');
    },
  );

  it("names a belt the way the academy's martial art does", () => {
    expect(labelOf(setup('bjj', { belt: 'green' }))).toBe('Green (kids)');
    TestBed.resetTestingModule();
    expect(labelOf(setup('judo', { belt: 'green' }))).toBe('Green');
    TestBed.resetTestingModule();
    expect(labelOf(setup('taekwondo', { belt: 'black-and-red' }))).toBe('Poom');
  });

  it("writes a dan instead of drawing tiles, counted from the grade's first", () => {
    // A FIJLKAM black belt stores 0-4 and reads 1st-5th dan (#1801): tiles
    // would claim stripes on the belt, which none of these federations mark.
    const badge = setup('judo', { belt: 'black', stripes: 2 });
    const el = badge.nativeElement as HTMLElement;
    expect(el.querySelector('[data-cy="belt-count"]')?.textContent?.trim()).toBe('3° dan');
    expect(el.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(0);
  });

  it('draws no count at all where the caller passes none — never a default 1° dan', () => {
    // 0 is the 1st dan on a FIJLKAM black: a badge defaulting to it would
    // call every judo black belt in the feed "1° dan" (#1801 pre-review).
    TestBed.configureTestingModule({
      imports: [CountlessHostComponent],
      providers: [...provideI18nTesting()],
    });
    useLadder('judo');
    const fixture = TestBed.createComponent(CountlessHostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-cy="belt-count"]')).toBeNull();
    expect(el.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(0);
  });

  it('draws tacche on a karate belt that counts them', () => {
    const el = setup('karate', { belt: 'green', stripes: 2 }).nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(2);
    expect(el.querySelector('[data-cy="belt-count"]')).toBeNull();
  });

  describe('stripes (#165)', () => {
    it('renders no stripe tiles when stripes input is 0 (default)', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(0);
    });

    it.each([1, 2, 3, 4])('renders %d stripe tiles inside the pill', (n) => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = n;
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(n);
    });

    it("clamps stripes to the grade's cap in the ladder — 4 on a BJJ white, 6 on a black", () => {
      // A bogus 99 must clamp to the grade's cap, not to the global ceiling:
      // the badge would otherwise draw a stale row as a 10-stripe white.
      const white = setup('bjj', { belt: 'white', stripes: 99 }).nativeElement as HTMLElement;
      expect(white.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(4);
      TestBed.resetTestingModule();
      const black = setup('bjj', { belt: 'black', stripes: 99 }).nativeElement as HTMLElement;
      expect(black.querySelectorAll('[data-cy="belt-stripe-tile"]').length).toBe(6);
    });

    it('renders 5-6 tiles on a black belt (graus 5° / 6°, #229)', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.belt = 'black';
      fixture.componentInstance.stripes = 6;
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll(
        '[data-cy="belt-stripe-tile"]',
      ) as NodeListOf<Element>;
      expect(tiles.length).toBe(6);
    });

    it('exposes an aria-label on the stripe group for screen readers', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = 2;
      fixture.detectChanges();
      const group = fixture.nativeElement.querySelector('.belt-badge__stripes');
      expect(group?.getAttribute('aria-label')).toBe('2 stripes');
    });

    it('uses singular "stripe" in aria-label when count is 1', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.stripes = 1;
      fixture.detectChanges();
      const group = fixture.nativeElement.querySelector('.belt-badge__stripes');
      expect(group?.getAttribute('aria-label')).toBe('1 stripe');
    });
  });

  describe('spine appearance (#1429)', () => {
    it('defaults to the badge — every existing caller is unaffected', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('p-tag')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="belt-spine"]')).toBeNull();
    });

    it('renders a spine instead of the pill when asked', () => {
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.belt = 'blue';
      fixture.componentInstance.appearance = 'spine';
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('p-tag')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-cy="belt-spine"]')).not.toBeNull();
    });

    it('carries the belt name on aria-label rather than as visible text', () => {
      // Redundant encoding, not decoration: colour alone would carry the fact
      // for nobody using a screen reader, and the words are still written
      // elsewhere on the row — so the spine itself stays silent to the eye
      // and speaks only to assistive tech.
      TestBed.configureTestingModule({
        imports: [BeltBadgeComponent, HostComponent],
        providers: [...provideI18nTesting()],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.belt = 'purple';
      fixture.componentInstance.appearance = 'spine';
      fixture.detectChanges();

      const spine = fixture.nativeElement.querySelector('[data-cy="belt-spine"]') as HTMLElement;
      expect(spine.getAttribute('aria-label')).toBe('Purple');
      expect(spine.textContent?.trim()).toBe('');
    });

    it('shares the same clamped stripe count as the badge', () => {
      // One source of truth, not two: the grade's cap is read once, by
      // `stripeTiles()`, and both appearances consume it.
      const el = setup('bjj', { belt: 'white', stripes: 99, appearance: 'spine' })
        .nativeElement as HTMLElement;
      const bands = el.querySelectorAll('[data-cy="belt-spine-stripe"]');
      expect(bands.length).toBe(4);
      bands.forEach((band: Element) => expect(band.getAttribute('aria-hidden')).toBe('true'));
    });

    it.each<[Belt, string, string]>([
      ['blue', 'blue', 'blue'],
      ['red-and-black', 'red', 'black'],
      ['green-and-blue', 'green', 'blue'],
    ])(
      'shows both halves of %s on the spine, which has no text to protect',
      (belt, top, bottom) => {
        const badge = setup('judo', { belt, appearance: 'spine' });
        expect(badge.componentInstance.spineStyle()['background']).toBe(
          `linear-gradient(180deg, var(--budojo-belt-${top}) 0 50%, var(--budojo-belt-${bottom}) 50% 100%)`,
        );
        // The stripe bands sit on the bottom half, so they take its ink.
        expect(badge.componentInstance.spineStyle()['color']).toBe(
          `var(--budojo-belt-${bottom}-ink)`,
        );
      },
    );
  });
});
