import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';

/**
 * Renders a past timestamp as a human-friendly relative string
 * ("now", "5 min ago", "yesterday", "May 12") — replaces the
 * `DatePipe: 'medium'` shape that read like a log line on community
 * post timestamps (#646, post-v2.8.0).
 *
 * Locale-aware via `LanguageService.currentLang()`:
 * - English: "now" / "5 min ago" / "yesterday" / "May 12" / "May 12, 2025"
 * - Italian: "adesso" / "5 min fa" / "ieri" / "12 mag" / "12 mag 2025"
 *
 * Non-pure so it tracks the LanguageService signal — pure pipes are
 * cached by reference and wouldn't re-render when the user flips the
 * sidebar language toggle. Cost is bounded — Angular only re-invokes
 * on view check (every CD pass on OnPush parents is fine).
 *
 * Buckets:
 * - < 60s → "now" / "adesso"
 * - < 60m → "Xm" / "X min fa"
 * - < 24h → "Xh" / "X ore fa"
 * - < 48h → "yesterday" / "ieri"
 * - < 7 days → short weekday + time ("Mon at 10:30" / "lun alle 10:30")
 * - same year → "May 12" / "12 mag"
 * - else → "May 12, 2025" / "12 mag 2025"
 */
@Pipe({
  name: 'relativeTime',
  standalone: true,
  pure: false,
})
export class RelativeTimePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(value: string | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    const lang = this.languageService.currentLang();
    const locale = lang === 'it' ? 'it-IT' : 'en-US';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);

    // < 60s — "now"
    if (Math.abs(diffSec) < 60) {
      return lang === 'it' ? 'adesso' : 'now';
    }

    // < 60m — "Xm" / "X min fa"
    if (Math.abs(diffMin) < 60) {
      const n = Math.abs(diffMin);
      return lang === 'it' ? `${n} min fa` : `${n} min ago`;
    }

    // < 24h — "Xh" / "X ore fa"
    if (Math.abs(diffHour) < 24) {
      const n = Math.abs(diffHour);
      if (lang === 'it') {
        return n === 1 ? '1 ora fa' : `${n} ore fa`;
      }
      return n === 1 ? '1 hour ago' : `${n} hours ago`;
    }

    // < 48h — "yesterday" / "ieri"
    if (Math.abs(diffDay) < 2) {
      return lang === 'it' ? 'ieri' : 'yesterday';
    }

    // < 7d — short weekday + time
    if (Math.abs(diffDay) < 7) {
      const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
      const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return lang === 'it' ? `${weekday} alle ${time}` : `${weekday} at ${time}`;
    }

    // Same year — short date ("May 12" / "12 mag")
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }

    // Different year — short date with year ("May 12, 2025")
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
