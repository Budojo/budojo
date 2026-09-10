import { describe, expect, it } from 'vitest';
import { datePickerFormatFor, formatIsoDate, formatIsoMonth, localeFor } from './locale';
import { SUPPORTED_LANGUAGES } from '../../core/services/language.service';

/**
 * Single-source helper that maps the SPA's `SupportedLanguage` codes
 * to BCP-47 tags consumed by `Intl.*` and PrimeNG. Tested explicitly
 * because every locale-aware screen depends on the mapping; a
 * regression here would manifest as silent drift across the app.
 */
describe('localeFor', () => {
  it('maps "en" to en-GB (EU-default day-first date order, identical EUR formatting)', () => {
    expect(localeFor('en')).toBe('en-GB');
  });

  it('maps "it" to it-IT', () => {
    expect(localeFor('it')).toBe('it-IT');
  });

  it('handles every entry in SUPPORTED_LANGUAGES (no missing cases as the list grows)', () => {
    // Trip-wire for #271 (multi-market expansion: ES + DE land later).
    // The exhaustive switch in `localeFor` is the compile-time guard;
    // this test is the runtime mirror — it walks the canonical
    // language list and asserts every code returns a non-empty
    // BCP-47 tag with a hyphen separator.
    for (const lang of SUPPORTED_LANGUAGES) {
      const tag = localeFor(lang);
      expect(tag, `localeFor("${lang}")`).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});

describe('one date format, and dates people read (#1498)', () => {
  describe('datePickerFormatFor', () => {
    it('gives every picker the same day-first format', () => {
      // There were two before this — `dd/mm/yy` in six pickers and
      // `yy-mm-dd` in five — so the same athlete's joining date and belt date
      // were written differently one tab apart.
      expect(datePickerFormatFor('en')).toBe('dd/mm/yy');
      expect(datePickerFormatFor('it')).toBe('dd/mm/yy');
    });
  });

  describe('formatIsoDate', () => {
    it('turns a wire date into one a person reads', () => {
      expect(formatIsoDate('2024-09-01', 'en')).toBe('1 September 2024');
      expect(formatIsoDate('2024-09-01', 'it')).toBe('1 settembre 2024');
    });

    it('does not shift the day for a reader west of Greenwich', () => {
      // `new Date('2024-09-01')` parses as UTC midnight, which is 31 August
      // in every timezone behind it. Parsed field by field instead.
      expect(formatIsoDate('2024-01-01', 'en')).toContain('1 January 2024');
      expect(formatIsoDate('2024-12-31', 'en')).toContain('31 December 2024');
    });

    it('hands back anything it cannot parse, rather than inventing a date', () => {
      expect(formatIsoDate('', 'en')).toBe('');
      expect(formatIsoDate('not-a-date', 'en')).toBe('not-a-date');
    });
  });

  describe('formatIsoMonth', () => {
    it('names the month instead of numbering it', () => {
      // The leaderboard rendered the API's `meta.month` verbatim, so the
      // period read `2026-04`.
      expect(formatIsoMonth('2026-04', 'en')).toBe('April 2026');
      expect(formatIsoMonth('2026-04', 'it')).toBe('aprile 2026');
    });

    it('hands back anything it cannot parse', () => {
      expect(formatIsoMonth('2026', 'en')).toBe('2026');
    });
  });
});
