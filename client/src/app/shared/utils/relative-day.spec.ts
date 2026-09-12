import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { relativeDay } from './relative-day';

/**
 * The relative-day wording (#1602).
 *
 * It existed twice before this — once per coverage screen — with identical
 * bucketing and identical strings, and neither copy had a test. The boundaries
 * are the whole behaviour, so they are pinned here rather than trusted.
 */
describe('relativeDay', () => {
  let translate: TranslateService;
  const now = new Date(2026, 10, 18); // 18 November 2026, a fixed Wednesday.

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideI18nTesting()] });
    translate = TestBed.inject(TranslateService);
  });

  it.each([
    ['2026-11-18', 'today'],
    ['2026-11-17', 'yesterday'],
    ['2026-11-16', '2 days ago'],
    // Six days is still days; seven becomes a week.
    ['2026-11-12', '6 days ago'],
    ['2026-11-11', 'a week ago'],
    ['2026-11-05', 'a week ago'],
    ['2026-11-04', '2 weeks ago'],
    ['2026-09-02', '11 weeks ago'],
  ])('reads %s as "%s"', (iso, expected) => {
    expect(relativeDay(iso, translate, now)).toBe(expected);
  });

  it('never counts backwards for a day in the future', () => {
    // A lesson planned for next week is not "-7 days ago".
    expect(relativeDay('2026-11-25', translate, now)).toBe('today');
  });

  it('answers with nothing for no date', () => {
    expect(relativeDay('', translate, now)).toBe('');
  });
});
