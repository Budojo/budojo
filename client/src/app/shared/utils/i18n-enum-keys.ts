import type { MartialArt, TrainingMode } from '../../core/services/academy.service';
import { AthleteStatus, Belt } from '../../core/services/athlete.service';

/**
 * The neutral name of every belt colour (#357, #1800): "White", "Green and
 * blue". The compiler enforces every `Belt` case is mapped, and the keys are
 * statically greppable for the `i18n-keys.spec.ts` parity check.
 *
 * Neutral on purpose — a green belt is "Green" in judo and karate. What one
 * martial art calls a colour differently lives in `BELT_KEY_OVERRIDES`, and
 * `beltKey()` is the one resolver; prefer `BeltLadderService.label()`, which
 * already knows the academy's art.
 */
export const BELT_KEYS: Readonly<Record<Belt, string>> = {
  grey: 'belts.grey',
  yellow: 'belts.yellow',
  orange: 'belts.orange',
  green: 'belts.green',
  white: 'belts.white',
  blue: 'belts.blue',
  purple: 'belts.purple',
  brown: 'belts.brown',
  black: 'belts.black',
  'red-and-black': 'belts.redAndBlack',
  'red-and-white': 'belts.redAndWhite',
  red: 'belts.red',
  'white-and-yellow': 'belts.whiteAndYellow',
  'yellow-and-orange': 'belts.yellowAndOrange',
  'orange-and-green': 'belts.orangeAndGreen',
  'green-and-blue': 'belts.greenAndBlue',
  'blue-and-brown': 'belts.blueAndBrown',
  'yellow-and-green': 'belts.yellowAndGreen',
  'blue-and-red': 'belts.blueAndRed',
  'black-and-red': 'belts.blackAndRed',
};

/**
 * What a martial art calls a colour when the neutral name is not enough
 * (#1800). BJJ keeps the labels it always had — "Green (kids)", "Red & black
 * (7°)" — character for character; taekwondo calls its under-15 black belt
 * the poom. Explicit keys, never built ones, so the parity check sees them.
 */
export const BELT_KEY_OVERRIDES: Readonly<Record<MartialArt, Partial<Record<Belt, string>>>> = {
  bjj: {
    grey: 'belts.bjj.grey',
    yellow: 'belts.bjj.yellow',
    orange: 'belts.bjj.orange',
    green: 'belts.bjj.green',
    'red-and-black': 'belts.bjj.redAndBlack',
    'red-and-white': 'belts.bjj.redAndWhite',
    red: 'belts.bjj.red',
  },
  judo: {},
  karate: {},
  taekwondo: {
    'black-and-red': 'belts.taekwondo.blackAndRed',
  },
};

/** Every martial art Budojo ships a ladder for, in the order the pickers offer them (#1802). */
export const MARTIAL_ARTS: readonly MartialArt[] = ['bjj', 'judo', 'karate', 'taekwondo'];

/** The name of each martial art — explicit keys the parity check can see. */
export const MARTIAL_ART_KEYS: Readonly<Record<MartialArt, string>> = {
  bjj: 'martialArts.bjj',
  judo: 'martialArts.judo',
  karate: 'martialArts.karate',
  taekwondo: 'martialArts.taekwondo',
};

/**
 * The name of each training mode (#1803), `both` aside. Japanese and Korean
 * terms are not translated; `other` is. `both` is per art — "Gi and no-gi",
 * "Kata and kumite" — so it has its own map below.
 */
export const TRAINING_MODE_KEYS: Readonly<Record<Exclude<TrainingMode, 'both'>, string>> = {
  gi: 'academy.trainingMode.gi',
  nogi: 'academy.trainingMode.nogi',
  'tachi-waza': 'academy.trainingMode.tachiWaza',
  'ne-waza': 'academy.trainingMode.neWaza',
  kata: 'academy.trainingMode.kata',
  kumite: 'academy.trainingMode.kumite',
  poomsae: 'academy.trainingMode.poomsae',
  kyorugi: 'academy.trainingMode.kyorugi',
  other: 'academy.trainingMode.other',
};

/** `both`, as each martial art says it: its two modes, joined. */
export const TRAINING_MODE_BOTH_KEYS: Readonly<Record<MartialArt, string>> = {
  bjj: 'academy.trainingMode.both.bjj',
  judo: 'academy.trainingMode.both.judo',
  karate: 'academy.trainingMode.both.karate',
  taekwondo: 'academy.trainingMode.both.taekwondo',
};

/** The programme form's example of the split, one per art (#1803). */
export const TRAINING_MODE_HINT_KEYS: Readonly<Record<MartialArt, string>> = {
  bjj: 'academy.syllabus.kindHint.bjj',
  judo: 'academy.syllabus.kindHint.judo',
  karate: 'academy.syllabus.kindHint.karate',
  taekwondo: 'academy.syllabus.kindHint.taekwondo',
};

/**
 * The label of every age division (#1807), per martial art — the server's
 * `age_divisions` codes, each mapped to a key the parity check can see.
 * A code the client does not know yet (a federation's new class) reads as
 * itself rather than as a raw key.
 */
export const AGE_BAND_KEYS: Readonly<Record<MartialArt, Readonly<Record<string, string>>>> = {
  bjj: {
    mighty_mite: 'stats.athletes.bands.bjj.mighty_mite',
    pee_wee: 'stats.athletes.bands.bjj.pee_wee',
    junior: 'stats.athletes.bands.bjj.junior',
    teen: 'stats.athletes.bands.bjj.teen',
    juvenile: 'stats.athletes.bands.bjj.juvenile',
    adult: 'stats.athletes.bands.bjj.adult',
    master_1: 'stats.athletes.bands.bjj.master_1',
    master_2: 'stats.athletes.bands.bjj.master_2',
    master_3: 'stats.athletes.bands.bjj.master_3',
    master_4: 'stats.athletes.bands.bjj.master_4',
    master_5: 'stats.athletes.bands.bjj.master_5',
    master_6: 'stats.athletes.bands.bjj.master_6',
    master_7: 'stats.athletes.bands.bjj.master_7',
  },
  judo: {
    bambini_a: 'stats.athletes.bands.judo.bambini_a',
    bambini_b: 'stats.athletes.bands.judo.bambini_b',
    fanciulli: 'stats.athletes.bands.judo.fanciulli',
    ragazzi: 'stats.athletes.bands.judo.ragazzi',
    esordienti_a: 'stats.athletes.bands.judo.esordienti_a',
    esordienti_b: 'stats.athletes.bands.judo.esordienti_b',
    cadetti: 'stats.athletes.bands.judo.cadetti',
    juniores: 'stats.athletes.bands.judo.juniores',
    seniores: 'stats.athletes.bands.judo.seniores',
    master: 'stats.athletes.bands.judo.master',
  },
  karate: {
    bambini_a: 'stats.athletes.bands.karate.bambini_a',
    bambini_b: 'stats.athletes.bands.karate.bambini_b',
    fanciulli: 'stats.athletes.bands.karate.fanciulli',
    ragazzi: 'stats.athletes.bands.karate.ragazzi',
    esordienti: 'stats.athletes.bands.karate.esordienti',
    cadetti: 'stats.athletes.bands.karate.cadetti',
    juniores: 'stats.athletes.bands.karate.juniores',
    seniores: 'stats.athletes.bands.karate.seniores',
    master_a: 'stats.athletes.bands.karate.master_a',
    master_b: 'stats.athletes.bands.karate.master_b',
    master_c: 'stats.athletes.bands.karate.master_c',
    master_d: 'stats.athletes.bands.karate.master_d',
    master_e: 'stats.athletes.bands.karate.master_e',
  },
  taekwondo: {
    under_12: 'stats.athletes.bands.taekwondo.under_12',
    cadet: 'stats.athletes.bands.taekwondo.cadet',
    junior: 'stats.athletes.bands.taekwondo.junior',
    under_30: 'stats.athletes.bands.taekwondo.under_30',
    under_40: 'stats.athletes.bands.taekwondo.under_40',
    under_50: 'stats.athletes.bands.taekwondo.under_50',
    under_60: 'stats.athletes.bands.taekwondo.under_60',
    under_65: 'stats.athletes.bands.taekwondo.under_65',
    over_65: 'stats.athletes.bands.taekwondo.over_65',
  },
};

export function ageBandKey(art: MartialArt, code: string): string | null {
  return AGE_BAND_KEYS[art][code] ?? null;
}

/** The chart's title, naming the federation whose divisions it counts in (#1807). */
export const AGE_BANDS_TITLE_KEYS: Readonly<Record<MartialArt, string>> = {
  bjj: 'stats.athletes.ageBandsTitle.bjj',
  judo: 'stats.athletes.ageBandsTitle.judo',
  karate: 'stats.athletes.ageBandsTitle.karate',
  taekwondo: 'stats.athletes.ageBandsTitle.taekwondo',
};

/** The translation key for a belt, as the given martial art names it. */
export function beltKey(belt: Belt, art: MartialArt): string {
  return BELT_KEY_OVERRIDES[art][belt] ?? BELT_KEYS[belt];
}

/**
 * Single source of truth for the `statuses.*` translation key bindings
 * (#357 Copilot review). Consumers: `athlete-detail.component`,
 * `athlete-form.component`. The compiler enforces every `AthleteStatus`
 * enum case is mapped.
 */
export const STATUS_KEYS: Readonly<Record<AthleteStatus, string>> = {
  active: 'statuses.active',
  inactive: 'statuses.inactive',
};

/**
 * Statuses surfaced in the form picker, in the order the dropdown
 * lists them. Exported alongside `STATUS_KEYS` so callers don't
 * re-declare the order separately.
 */
export const STATUS_ORDER: readonly AthleteStatus[] = ['active', 'inactive'] as const;
