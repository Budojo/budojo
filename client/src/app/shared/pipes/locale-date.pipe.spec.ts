import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageService } from '../../core/services/language.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { LocaleDatePipe } from './locale-date.pipe';

/**
 * #1624 — six screens rendered "Sep 14, 2026, 6:12:00 PM" in an Italian UI,
 * because `DatePipe` formats against a `LOCALE_ID` this app never sets and
 * the language toggle cannot move.
 */
describe('LocaleDatePipe', () => {
  function make(lang: 'en' | 'it' = 'en') {
    TestBed.configureTestingModule({ providers: [...provideI18nTesting(), LocaleDatePipe] });
    TestBed.inject(LanguageService).setLanguage(lang);
    return TestBed.runInInjectionContext(() => new LocaleDatePipe());
  }

  afterEach(() => TestBed.resetTestingModule());

  // Local time on purpose: "when did this happen on this machine".
  const AT = new Date(2026, 8, 14, 18, 12, 0);

  it('writes the date in Italian when the app is in Italian', () => {
    expect(make('it').transform(AT, 'date')).toBe('14 settembre 2026');
  });

  it('writes it day-first in English, not month-first', () => {
    // `localeFor` maps `en` to en-GB for exactly this reason.
    expect(make('en').transform(AT, 'date')).toBe('14 September 2026');
  });

  it('keeps the time, drops the seconds, and stays short enough for a log row', () => {
    // Not "14 settembre 2026 alle ore 18:12" — a column of those is its own
    // kind of unreadable.
    const pipe = make('it');
    expect(pipe.transform(AT)).toBe('14 set 2026, 18:12');

    TestBed.inject(LanguageService).setLanguage('en');
    expect(pipe.transform(AT)).toContain('18:12');
    expect(pipe.transform(AT)).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('follows the language toggle — a pure pipe would not', () => {
    TestBed.configureTestingModule({ providers: [...provideI18nTesting(), LocaleDatePipe] });
    const language = TestBed.inject(LanguageService);
    const pipe = TestBed.runInInjectionContext(() => new LocaleDatePipe());

    language.setLanguage('en');
    expect(pipe.transform(AT, 'date')).toContain('September');
    language.setLanguage('it');
    expect(pipe.transform(AT, 'date')).toContain('settembre');
  });

  it('truncates a calendar day instead of converting it (#1537)', () => {
    // A promotion dated 2026-03-15 is stored at UTC midnight. Read as an
    // instant it is the 14th for every reader west of Greenwich — and the
    // edit dialog beside it already opens on the 15th, so the row and the
    // picker would disagree by a day.
    const pipe = make('it');

    // True in every timezone, because the mode reads the string and stops.
    expect(pipe.transform('2026-03-15T00:00:00Z', 'calendar-day')).toBe('15 marzo 2026');
    expect(pipe.transform('2026-03-15T23:30:00Z', 'calendar-day')).toBe('15 marzo 2026');
  });

  it('renders nothing for an absent or unreadable value', () => {
    const pipe = make('it');
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('not-a-date')).toBe('');
  });

  it('reads an ISO string as well as a Date', () => {
    expect(make('it').transform('2026-09-14T10:00:00Z', 'date')).toContain('settembre');
  });
});
