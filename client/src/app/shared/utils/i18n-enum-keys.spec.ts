import { BELT_KEYS, BELT_ORDER, STATUS_KEYS, STATUS_ORDER } from './i18n-enum-keys';
import type { AthleteStatus, Belt } from '../../core/services/athlete.service';

describe('i18n enum-key bindings (#357)', () => {
  describe('BELT_KEYS', () => {
    it('maps every Belt case to a `belts.*` key', () => {
      // BELT_ORDER lists every Belt case in IBJJF progression order;
      // pin it as the authoritative key set so an unmapped new belt
      // here trips at compile time (compiler enforces Record<Belt, …>)
      // AND at test time (this assertion).
      const mapKeys = Object.keys(BELT_KEYS) as Belt[];
      expect(new Set(mapKeys)).toEqual(new Set(BELT_ORDER));
    });

    it('the belts.* keys are statically greppable strings (no template interpolation)', () => {
      for (const value of Object.values(BELT_KEYS)) {
        expect(value).toMatch(/^belts\.[a-zA-Z]+$/);
      }
    });

    it('uses camelCase for the multi-word colours (matches i18n bundle convention)', () => {
      expect(BELT_KEYS['red-and-black']).toBe('belts.redAndBlack');
      expect(BELT_KEYS['red-and-white']).toBe('belts.redAndWhite');
    });
  });

  describe('BELT_ORDER', () => {
    it('lists every Belt case exactly once', () => {
      expect(new Set(BELT_ORDER).size).toBe(BELT_ORDER.length);
    });

    it('starts with the kids ranks (grey → yellow → orange → green) before white', () => {
      expect(BELT_ORDER.slice(0, 5)).toEqual(['grey', 'yellow', 'orange', 'green', 'white']);
    });

    it('ends with the senior coral / red ranks', () => {
      expect(BELT_ORDER.slice(-3)).toEqual(['red-and-black', 'red-and-white', 'red']);
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
      expect(STATUS_ORDER).toEqual(['active', 'suspended', 'inactive']);
    });
  });
});
