import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';
import { localeFor } from '../utils/locale';

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
    // Central locale helper — `en` → `en-GB` per repo policy
    // (Copilot review on #646). The format strings here are not
    // fixed-width so the `en-GB` choice doesn't risk the "September
    // abbreviation" foot-gun documented in shared/utils/locale.ts.
    const locale = localeFor(lang);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Future timestamps (rare clock-skew or a server clock ahead of
    // the client) shouldn't render as past-tense — "5 min ago" on a
    // future date is nonsense. Clamp tiny skew to "now"; fall back to
    // an absolute short date for genuine future dates (Copilot review
    // on #649).
    if (diffMs < 0) {
      if (diffMs > -60_000) {
        return lang === 'it' ? 'adesso' : 'now';
      }
      const sameYear = date.getFullYear() === now.getFullYear();
      return date.toLocaleDateString(
        locale,
        sameYear
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' },
      );
    }

    // Math.floor (integer division) on each bucket so 59m59s reads
    // "59 min ago", not "1 hour ago" — Math.round would push the
    // value over the next threshold (Copilot review on #649).
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // < 60s — "now"
    if (diffSec < 60) {
      return lang === 'it' ? 'adesso' : 'now';
    }

    // < 60m — "X min ago"
    if (diffMin < 60) {
      return lang === 'it' ? `${diffMin} min fa` : `${diffMin} min ago`;
    }

    // < 24h — "X hours ago"
    if (diffHour < 24) {
      if (lang === 'it') {
        return diffHour === 1 ? '1 ora fa' : `${diffHour} ore fa`;
      }
      return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
    }

    // < 48h — "yesterday"
    if (diffDay < 2) {
      return lang === 'it' ? 'ieri' : 'yesterday';
    }

    // < 7d — short weekday + time (24-hour via en-GB)
    if (diffDay < 7) {
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
