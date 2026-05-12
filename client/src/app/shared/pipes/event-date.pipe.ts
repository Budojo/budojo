import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';
import { localeFor } from '../utils/locale';

/**
 * Renders an event `starts_at` as a human-friendly future-tense
 * string — replaces the `DatePipe: 'medium'` shape that read like a
 * server log on the community event cards (#646, post-v2.8.0).
 *
 * Locale-aware via `LanguageService.currentLang()`:
 * - English: "Today at 10:00 AM" / "Tomorrow at 10:00 AM" /
 *   "Saturday at 10:00 AM" / "May 16 at 10:00 AM" / "May 16, 2027
 *   at 10:00 AM"
 * - Italian: "Oggi alle 10:00" / "Domani alle 10:00" / "Sabato alle
 *   10:00" / "16 maggio alle 10:00" / "16 maggio 2027 alle 10:00"
 *
 * Buckets (computed against the day boundary, not 24-hour windows —
 * so an event at 23:00 on day X reads "today", not "in 23 hours"):
 * - Same calendar day → "today at ..."
 * - Tomorrow → "tomorrow at ..."
 * - Next 6 days → "Saturday at ..." (weekday name)
 * - Same year → "May 16 at ..."
 * - Different year → "May 16, 2027 at ..."
 *
 * Past events (the rare case of viewing a historical event) fall
 * back to a non-relative absolute format so the SPA doesn't lie
 * with "tomorrow" on a 2-week-old card.
 */
@Pipe({
  name: 'eventDate',
  standalone: true,
  pure: false,
})
export class EventDatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(value: string | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    const lang = this.languageService.currentLang();
    // Central locale helper — `en` → `en-GB` per repo policy
    // (Copilot review on #646). All format strings here use long
    // month names, so the `en-GB` "Sept" abbreviation foot-gun
    // documented in shared/utils/locale.ts doesn't apply.
    const locale = localeFor(lang);
    const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    const today = startOfDay(new Date());
    const eventDay = startOfDay(date);
    const diffDays = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return lang === 'it' ? `Oggi alle ${time}` : `Today at ${time}`;
    }
    if (diffDays === 1) {
      return lang === 'it' ? `Domani alle ${time}` : `Tomorrow at ${time}`;
    }
    if (diffDays > 1 && diffDays < 7) {
      const weekday = date.toLocaleDateString(locale, { weekday: 'long' });
      // Capitalise weekday first letter for Italian (toLocaleDateString
      // returns lowercase in IT — "sabato" not "Sabato").
      const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return lang === 'it' ? `${weekdayCap} alle ${time}` : `${weekdayCap} at ${time}`;
    }

    const sameYear = date.getFullYear() === today.getFullYear();
    const datePart = sameYear
      ? date.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
      : date.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });

    return lang === 'it' ? `${datePart} alle ${time}` : `${datePart} at ${time}`;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
