import type { TranslateService } from '@ngx-translate/core';
import type { SupportedLanguage } from '../../core/services/language.service';
import { localeFor } from './locale';
import type { WeekMessageLabels } from './week-message';

/** Short weekday names for the group message, Monday first. */
const WEEKDAY_KEYS = [
  'weekdays.mon',
  'weekdays.tue',
  'weekdays.wed',
  'weekdays.thu',
  'weekdays.fri',
  'weekdays.sat',
  'weekdays.sun',
] as const;

/**
 * The reader's words for the week's message (#1863, #1940), for every place
 * that sends it. Only these are translated: the class and programme names are
 * the academy's own.
 */
export function weekMessageLabels(
  translate: TranslateService,
  lang: SupportedLanguage,
): WeekMessageLabels {
  return {
    heading: translate.instant('weekMessage.heading'),
    weekdays: WEEKDAY_KEYS.map((key) => translate.instant(key)),
    closed: translate.instant('weekMessage.closed'),
    closedUntil: (lastDay) =>
      translate.instant('weekMessage.closedUntil', { date: longDate(lastDay, lang) }),
  };
}

/** "6 gennaio": a closure's last day, in the reader's language. */
function longDate(iso: string, lang: SupportedLanguage): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'long' }).format(
    new Date(y, m - 1, d),
  );
}
