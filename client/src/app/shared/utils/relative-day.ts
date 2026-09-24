import { TranslateService } from '@ngx-translate/core';

/**
 * Translation keys for "how long ago was that day" (#1602).
 *
 * One namespace, because the strings were the duplicated part. `ago()` lived
 * twice — once on the academy's coverage view, once on the athlete's — with
 * identical bucketing and identical English and Italian. Duplicated
 * *translated* strings are worse than duplicated code: a pluralisation fix or
 * a wording change in one copy leaves the other saying something slightly
 * different about the same thing, and no gate can see it. The i18n parity
 * check compares `en` against `it`, never one namespace against another.
 */
const KEYS = {
  today: 'relativeDay.today',
  yesterday: 'relativeDay.yesterday',
  days: 'relativeDay.days',
  weekOne: 'relativeDay.weekOne',
  weeks: 'relativeDay.weeks',
  monthOne: 'relativeDay.monthOne',
  monthOther: 'relativeDay.monthOther',
  yearOne: 'relativeDay.yearOne',
  yearOther: 'relativeDay.yearOther',
} as const;

/** Eight weeks: the first distance read in months (#1726). */
const MONTHS_FROM_DAYS = 56;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

/** Days between a `YYYY-MM-DD` day and today, never negative. */
function daysSince(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return Math.max(0, Math.round((midnightToday - then) / 86_400_000));
}

/**
 * "today" / "yesterday" / "3 days ago" / "a week ago" / "5 weeks ago" /
 * "3 months ago" / "a year ago".
 *
 * The answer to "when did we last do this?", which is a question about
 * distance rather than about a date. Whole weeks once past seven days, because
 * nobody plans in days at that range; months from eight weeks and years from
 * twelve months, because nobody counts an absence in weeks either.
 *
 * The caller passes `now` only in tests; production reads the clock here so a
 * component does not have to.
 */
export function relativeDay(
  iso: string,
  translate: TranslateService,
  now: Date = new Date(),
): string {
  if (iso === '') return '';

  const days = daysSince(iso, now);

  if (days === 0) return translate.instant(KEYS.today);
  if (days === 1) return translate.instant(KEYS.yesterday);
  if (days < 7) return translate.instant(KEYS.days, { count: days });

  if (days < MONTHS_FROM_DAYS) {
    const weeks = Math.floor(days / 7);

    return weeks === 1
      ? translate.instant(KEYS.weekOne)
      : translate.instant(KEYS.weeks, { count: weeks });
  }

  // Months from eight weeks, years from twelve months (#1726). Without them a
  // long absence read "25 weeks ago" — at the top of the roster's
  // longest-absent sort, the one place it is read most. Rounded rather than
  // floored: eight weeks is nearer two months than one.
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 12) {
    return months === 1
      ? translate.instant(KEYS.monthOne)
      : translate.instant(KEYS.monthOther, { count: months });
  }

  const years = Math.max(1, Math.round(days / DAYS_PER_YEAR));

  return years === 1
    ? translate.instant(KEYS.yearOne)
    : translate.instant(KEYS.yearOther, { count: years });
}
