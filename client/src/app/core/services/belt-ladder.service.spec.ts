import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import {
  LADDER_FIXTURES,
  TRAINING_MODE_FIXTURES,
  useLadder,
} from '../../../test-utils/ladder-test';
import { AcademyService } from './academy.service';
import { BeltLadderService, STRIPES_CEILING } from './belt-ladder.service';

function setup(): BeltLadderService {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
  });
  return TestBed.inject(BeltLadderService);
}

describe('BeltLadderService (#1801)', () => {
  it("offers the academy's own belts, in rank order", () => {
    const ladder = setup();
    useLadder('judo');

    expect(ladder.belts().slice(0, 3)).toEqual(['white', 'white-and-yellow', 'yellow']);
    expect(ladder.belts()).not.toContain('purple');
    expect(ladder.beltOptions()[1]).toEqual({
      label: 'White and yellow',
      value: 'white-and-yellow',
    });
  });

  it('caps stripes by the grade', () => {
    const ladder = setup();
    useLadder('karate');

    expect(ladder.stripeCap('green')).toBe(3);
    expect(ladder.stripeCap('black')).toBe(4);
    expect(ladder.stripeOptions('green').map((o) => o.value)).toEqual(['0', '1', '2', '3']);
  });

  it("counts dan and poom from the grade's first, and stripes as plain numbers", () => {
    const ladder = setup();
    useLadder('taekwondo');

    expect(
      ladder
        .stripeOptions('black')
        .map((o) => o.label)
        .slice(0, 2),
    ).toEqual(['1° dan', '2° dan']);
    expect(ladder.stripesLabel('black-and-red', 3)).toBe('4°'); // after the label "Poom"
    expect(ladder.countsStripes('black')).toBe(false);
    expect(ladder.stripeOptions('green')).toEqual([{ label: '0', value: '0' }]);
  });

  it('keeps BJJ exactly as it was', () => {
    const ladder = setup();
    useLadder('bjj');

    expect(ladder.belts()).toEqual([
      'grey',
      'yellow',
      'orange',
      'green',
      'white',
      'blue',
      'purple',
      'brown',
      'black',
      'red-and-black',
      'red-and-white',
      'red',
    ]);
    expect(ladder.stripeCap('black')).toBe(6);
    expect(ladder.stripeCap('purple')).toBe(4);
    expect(ladder.stripesLabel('black', 3)).toBe('3');
    expect(ladder.label('red-and-black')).toBe('Red & black (7°)');
  });

  it("starts an adult on the first grade that is not a kids' step", () => {
    const ladder = setup();
    useLadder('bjj');
    // BJJ opens with the kids' grey; nobody enrolling as an adult is grey.
    expect(ladder.startingBelt()).toBe('white');
  });

  it('reads as BJJ with no ladder until an academy is loaded', () => {
    // The web-only athlete portal never loads the academy.
    const ladder = setup();

    expect(ladder.martialArt()).toBe('bjj');
    expect(ladder.belts()).toEqual([]);
    expect(ladder.stripeCap('green')).toBe(STRIPES_CEILING);
    expect(ladder.label('green')).toBe('Green (kids)');
  });

  it('re-labels in the active language', () => {
    const ladder = setup();
    useLadder('judo');
    TestBed.inject(TranslateService).use('it');

    expect(ladder.label('white-and-yellow')).toBe('Bianco-gialla');
  });
});

describe('BeltLadderService — on the athlete portal (#1813)', () => {
  function athleteOf(art: 'judo' | 'bjj'): void {
    TestBed.inject(AcademyService).mine.set({
      id: 2,
      name: 'Their dojo',
      martial_art: art,
      grades: LADDER_FIXTURES[art],
      training_modes: TRAINING_MODE_FIXTURES[art],
    } as never);
  }

  it("draws an athlete's belts from their own academy when there is no owner academy", () => {
    const ladder = setup();
    athleteOf('judo');

    expect(ladder.martialArt()).toBe('judo');
    // Judo's "Green", not BJJ's "Green (kids)".
    expect(ladder.label('green')).toBe('Green');
    expect(ladder.belts()).not.toContain('purple');
  });

  it("prefers the owner's academy when the session has both", () => {
    const ladder = setup();
    useLadder('karate');
    athleteOf('judo');

    expect(ladder.martialArt()).toBe('karate');
  });

  it('forgets the athlete academy on sign-out', () => {
    const ladder = setup();
    athleteOf('judo');

    TestBed.inject(AcademyService).clear();

    expect(ladder.martialArt()).toBe('bjj');
    expect(ladder.belts()).toEqual([]);
  });
});
