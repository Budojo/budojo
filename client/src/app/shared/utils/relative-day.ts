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
} as const;

/** Days between a `YYYY-MM-DD` day and today, never negative. */
function daysSince(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return Math.max(0, Math.round((midnightToday - then) / 86_400_000));
}

/**
 * "today" / "yesterday" / "3 days ago" / "a week ago" / "5 weeks ago".
 *
 * The answer to "when did we last do this?", which is a question about
 * distance rather than about a date. Whole weeks once past seven days, because
 * nobody plans in days at that range.
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

  const weeks = Math.floor(days / 7);

  return weeks === 1
    ? translate.instant(KEYS.weekOne)
    : translate.instant(KEYS.weeks, { count: weeks });
}
