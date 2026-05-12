import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/services/language.service';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  let language: LanguageService;
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T20:00:00Z'));
    TestBed.configureTestingModule({ providers: [...provideI18nTesting()] });
    language = TestBed.inject(LanguageService);
    pipe = TestBed.runInInjectionContext(() => new RelativeTimePipe());
  });

  afterEach(() => vi.useRealTimers());

  describe('empty / invalid input', () => {
    it('returns empty string for null', () => {
      expect(pipe.transform(null)).toBe('');
    });
    it('returns empty string for undefined', () => {
      expect(pipe.transform(undefined)).toBe('');
    });
    it('returns empty string for an empty string', () => {
      expect(pipe.transform('')).toBe('');
    });
    it('returns empty string for an unparseable date', () => {
      expect(pipe.transform('not-a-date')).toBe('');
    });
  });

  describe('English (default)', () => {
    it('reads "now" within the last minute', () => {
      expect(pipe.transform(new Date('2026-05-12T19:59:30Z'))).toBe('now');
    });
    it('reads "X min ago" within the last hour', () => {
      expect(pipe.transform(new Date('2026-05-12T19:55:00Z'))).toBe('5 min ago');
    });
    it('reads "1 hour ago" at the hour boundary, plural otherwise', () => {
      expect(pipe.transform(new Date('2026-05-12T19:00:00Z'))).toBe('1 hour ago');
      expect(pipe.transform(new Date('2026-05-12T17:00:00Z'))).toBe('3 hours ago');
    });
    it('reads "yesterday" within 24-48h ago', () => {
      expect(pipe.transform(new Date('2026-05-11T18:00:00Z'))).toBe('yesterday');
    });
    it('reads a short date for same-year posts older than a week', () => {
      // Locale-formatted; assert by substring to dodge locale variation.
      const out = pipe.transform(new Date('2026-04-01T10:00:00Z'));
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/1/);
    });
    it('reads a short date with year for older posts', () => {
      const out = pipe.transform(new Date('2024-04-01T10:00:00Z'));
      expect(out).toMatch(/2024/);
    });
  });

  describe('Italian', () => {
    beforeEach(() => language.currentLang.set('it'));

    it('reads "adesso" within the last minute', () => {
      expect(pipe.transform(new Date('2026-05-12T19:59:30Z'))).toBe('adesso');
    });
    it('reads "X min fa" within the last hour', () => {
      expect(pipe.transform(new Date('2026-05-12T19:55:00Z'))).toBe('5 min fa');
    });
    it('reads "1 ora fa" / "X ore fa" within the day', () => {
      expect(pipe.transform(new Date('2026-05-12T19:00:00Z'))).toBe('1 ora fa');
      expect(pipe.transform(new Date('2026-05-12T17:00:00Z'))).toBe('3 ore fa');
    });
    it('reads "ieri" for 24-48h ago', () => {
      expect(pipe.transform(new Date('2026-05-11T18:00:00Z'))).toBe('ieri');
    });
  });
});
