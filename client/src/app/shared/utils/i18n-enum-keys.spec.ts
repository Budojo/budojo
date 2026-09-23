import EN from '../../../../public/assets/i18n/en.json';
import IT from '../../../../public/assets/i18n/it.json';
import {
  AGE_BAND_KEYS,
  SYLLABUS_NAME_PLACEHOLDER_KEYS,
  AGE_BANDS_TITLE_KEYS,
  BELT_KEYS,
  BELT_KEY_OVERRIDES,
  beltKey,
  STATUS_KEYS,
  STATUS_ORDER,
} from './i18n-enum-keys';
import type { AthleteStatus, Belt } from '../../core/services/athlete.service';
import type { MartialArt } from '../../core/services/academy.service';

/** Resolves a dotted key in a bundle, or undefined — the parity spec checks sets, not paths. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
}

const ARTS: readonly MartialArt[] = ['bjj', 'judo', 'karate', 'taekwondo'];

describe('i18n enum-key bindings (#357)', () => {
  describe('programme name placeholders (#1808)', () => {
    it("points every art's group and technique example at a key in both bundles", () => {
      for (const art of ARTS) {
        for (const key of Object.values(SYLLABUS_NAME_PLACEHOLDER_KEYS[art])) {
          expect(typeof lookup(EN, key), `${art} ${key} in en`).toBe('string');
          expect(typeof lookup(IT, key), `${art} ${key} in it`).toBe('string');
        }
      }
    });
  });

  describe('age division keys (#1807)', () => {
    // A code with no key reads as itself on the chart rather than failing,
    // so this is the check that says a label is missing.
    it('names every division of every art with a key that exists in both bundles', () => {
      for (const art of ARTS) {
        for (const [code, key] of Object.entries(AGE_BAND_KEYS[art])) {
          expect(typeof lookup(EN, key), `${art} ${code} in en`).toBe('string');
          expect(typeof lookup(IT, key), `${art} ${code} in it`).toBe('string');
        }
        expect(typeof lookup(EN, AGE_BANDS_TITLE_KEYS[art]), `${art} title in en`).toBe('string');
        expect(typeof lookup(IT, AGE_BANDS_TITLE_KEYS[art]), `${art} title in it`).toBe('string');
      }
    });
  });

  describe('belt keys (#1801)', () => {
    it('names every belt colour with a key that exists in both bundles', () => {
      for (const [belt, key] of Object.entries(BELT_KEYS)) {
        expect(typeof lookup(EN, key), `${belt} → ${key} in en`).toBe('string');
        expect(typeof lookup(IT, key), `${belt} → ${key} in it`).toBe('string');
      }
    });

    it('points every per-art override at a key that exists in both bundles', () => {
      for (const art of ARTS) {
        for (const [belt, key] of Object.entries(BELT_KEY_OVERRIDES[art])) {
          expect(typeof lookup(EN, key as string), `${art} ${belt}`).toBe('string');
          expect(typeof lookup(IT, key as string), `${art} ${belt}`).toBe('string');
        }
      }
    });

    it('keeps the BJJ labels exactly what they were', () => {
      // Every existing install is BJJ: a rename of keys, never of copy.
      const bjj = (belt: Belt): unknown => lookup(EN, beltKey(belt, 'bjj'));
      expect(bjj('green')).toBe('Green (kids)');
      expect(bjj('red-and-black')).toBe('Red & black (7°)');
      expect(bjj('red')).toBe('Red (9°/10°)');
      expect(bjj('black')).toBe('Black');
      expect(lookup(IT, beltKey('grey', 'bjj'))).toBe('Grigia (bambini)');
    });

    it('uses the neutral name where an art has no word of its own', () => {
      expect(beltKey('green', 'judo')).toBe('belts.green');
      expect(lookup(IT, beltKey('green', 'karate'))).toBe('Verde');
      expect(lookup(EN, beltKey('black-and-red', 'taekwondo'))).toBe('Poom');
      expect(lookup(IT, beltKey('white-and-yellow', 'judo'))).toBe('Bianco-gialla');
    });

    it('keeps every key statically greppable (no interpolation)', () => {
      for (const value of Object.values(BELT_KEYS)) {
        expect(value).toMatch(/^belts\.[a-zA-Z]+$/);
      }
    });
  });

  describe('STATUS_KEYS', () => {
    it('maps every AthleteStatus case to a `statuses.*` key', () => {
      const mapKeys = Object.keys(STATUS_KEYS) as AthleteStatus[];
      expect(new Set(mapKeys)).toEqual(new Set(STATUS_ORDER));
    });

    it('the statuses.* keys are statically greppable strings', () => {
      for (const value of Object.values(STATUS_KEYS)) {
        expect(value).toMatch(/^statuses\.[a-zA-Z]+$/);
      }
    });
  });

  describe('STATUS_ORDER', () => {
    it('lists active → suspended → inactive (dropdown order)', () => {
      expect(STATUS_ORDER).toEqual(['active', 'inactive']);
    });
  });
});
