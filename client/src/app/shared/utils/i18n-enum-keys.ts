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

/** The seed button and its hint, as each shipped starter programme is named (#1804). */
export interface StarterProgrammeKeys {
  readonly cta: string;
  readonly hint: string;
}

const STARTER_PROGRAMME_KEYS: Readonly<Record<string, StarterProgrammeKeys>> = {
  bjj: {
    cta: 'academy.syllabus.empty.starter.bjj.cta',
    hint: 'academy.syllabus.empty.starter.bjj.hint',
  },
  judo: {
    cta: 'academy.syllabus.empty.starter.judo.cta',
    hint: 'academy.syllabus.empty.starter.judo.hint',
  },
};

/**
 * The keys for a programme the server offers (`Academy.syllabus_programmes`).
 * A programme that ships before its copy does still gets a truthful button —
 * "Start from the shipped programme" — never a raw key on screen.
 */
export function starterProgrammeKeys(programme: string): StarterProgrammeKeys {
  return (
    STARTER_PROGRAMME_KEYS[programme] ?? {
      cta: 'academy.syllabus.empty.starter.other.cta',
      hint: 'academy.syllabus.empty.starter.other.hint',
    }
  );
}

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
