import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/services/language.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { EventDatePipe } from './event-date.pipe';

describe('EventDatePipe', () => {
  let language: LanguageService;
  let pipe: EventDatePipe;

  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-05-12 at 10:00 local — pick a stable now() for the day-
    // boundary computations.
    vi.setSystemTime(new Date(2026, 4, 12, 10, 0, 0));
    TestBed.configureTestingModule({ providers: [...provideI18nTesting()] });
    language = TestBed.inject(LanguageService);
    pipe = TestBed.runInInjectionContext(() => new EventDatePipe());
  });

  afterEach(() => vi.useRealTimers());

  describe('empty / invalid input', () => {
    it('returns empty string for null', () => {
      expect(pipe.transform(null)).toBe('');
    });
    it('returns empty string for an unparseable date', () => {
      expect(pipe.transform('not-a-date')).toBe('');
    });
  });

  describe('English (default)', () => {
    it('reads "Today at HH:MM" for same-day events', () => {
      const out = pipe.transform(new Date(2026, 4, 12, 18, 0, 0));
      expect(out).toMatch(/^Today at /);
    });
    it('reads "Tomorrow at HH:MM" for next-day events', () => {
      const out = pipe.transform(new Date(2026, 4, 13, 10, 0, 0));
      expect(out).toMatch(/^Tomorrow at /);
    });
    it('reads "Weekday at HH:MM" within the next 6 days', () => {
      const out = pipe.transform(new Date(2026, 4, 15, 10, 0, 0));
      expect(out).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at /);
    });
    it('reads "Month Day at HH:MM" for same-year events farther out', () => {
      const out = pipe.transform(new Date(2026, 5, 13, 10, 0, 0));
      expect(out).toMatch(/June/);
      expect(out).toMatch(/at/);
    });
    it('reads "Month Day, Year at HH:MM" when the year differs', () => {
      const out = pipe.transform(new Date(2027, 5, 13, 10, 0, 0));
      expect(out).toMatch(/2027/);
    });
  });

  describe('Italian', () => {
    beforeEach(() => language.currentLang.set('it'));

    it('reads "Oggi alle HH:MM"', () => {
      const out = pipe.transform(new Date(2026, 4, 12, 18, 0, 0));
      expect(out).toMatch(/^Oggi alle /);
    });
    it('reads "Domani alle HH:MM"', () => {
      const out = pipe.transform(new Date(2026, 4, 13, 10, 0, 0));
      expect(out).toMatch(/^Domani alle /);
    });
    it('capitalises the weekday name', () => {
      const out = pipe.transform(new Date(2026, 4, 15, 10, 0, 0));
      expect(out.charAt(0)).toBe(out.charAt(0).toUpperCase());
      expect(out).toMatch(/ alle /);
    });
  });
});
