import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';
import { formatIsoDate, localeFor } from '../utils/locale';

/**
 * What to show beside the date.
 *
 * - `datetime` — an instant, in local time, seconds dropped.
 * - `date` — an instant, as the local calendar day it falls on.
 * - `calendar-day` — a day the SERVER recorded, truncated rather than
 *   converted. A promotion dated `2026-03-15` is stored at UTC midnight; read
 *   as an instant it becomes the 14th for every reader west of Greenwich, and
 *   #1537 is the incident where that moved a payment into the wrong month.
 */
export type LocaleDateMode = 'date' | 'datetime' | 'calendar-day';

/**
 * An absolute timestamp a person reads, in the language they picked (#1624).
 *
 * Angular's own `DatePipe` formats against `LOCALE_ID`, which this SPA never
 * sets — so `| date: 'medium'` rendered **"Sep 14, 2026, 6:12:00 PM"** on six
 * screens of an otherwise Italian app, seconds and all: the activity log, the
 * promotion rows, the sessions and login-history tables, the API-token dates,
 * the browser-notification devices and every line of the backup page. The
 * language toggle could not move them, because `LOCALE_ID` is resolved once at
 * bootstrap and the toggle is a signal.
 *
 * Non-pure, like `RelativeTimePipe` beside it: a pure pipe is cached by input
 * reference and would keep the old language until the value itself changed.
 *
 * Where a timestamp is really a calendar day the server recorded — a payment,
 * a promotion — pass `'calendar-day'`, which truncates through `formatIsoDate`
 * rather than converting. That is what keeps a payment made at 23:00 UTC in
 * the month it was made (#1537). The other two modes convert to local time,
 * which is right for "when did this happen on my machine" and wrong for that.
 */
@Pipe({
  name: 'localeDate',
  standalone: true,
  pure: false,
})
export class LocaleDatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(value: string | Date | null | undefined, mode: LocaleDateMode = 'datetime'): string {
    if (value === null || value === undefined || value === '') return '';

    const lang = this.languageService.currentLang();
    if (mode === 'calendar-day') {
      // Truncate, never convert — `formatIsoDate` parses the date part field
      // by field, which is the whole point of this mode.
      const iso = typeof value === 'string' ? value : toIsoDay(value);
      return formatIsoDate(iso, lang);
    }

    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    // `datetime` is a log line — a column of "14 settembre 2026 alle ore
    // 18:12" is the same defect in the other direction. `medium` + `short`
    // reads "14 set 2026, 18:12" in Italian and "14 Sept 2026, 18:12" in
    // English, both day-first, neither carrying seconds.
    const options: Intl.DateTimeFormatOptions =
      mode === 'date'
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : { dateStyle: 'medium', timeStyle: 'short' };

    return date.toLocaleString(localeFor(lang), options);
  }
}

/** A `Date`'s own calendar day, in the shape `formatIsoDate` reads. */
function toIsoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
