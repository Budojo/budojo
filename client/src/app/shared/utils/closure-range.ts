import type { AcademyClosure } from '../../core/services/academy.service';

/**
 * A closure's dates the way a person says them (#1766): "15 August", "10–25
 * August", "30 September – 4 October", "24 December 2026 – 6 January 2027".
 * What the two ends share is said once, and the year only when the range is
 * not all in `today`'s year.
 *
 * Built by hand rather than with `Intl.formatRange`: Chrome's Italian range
 * pattern zero-pads the day ("07–09 settembre"), which reads as a machine
 * wrote it, and the output then differs between engines.
 */
export function formatClosureRange(
  closure: Pick<AcademyClosure, 'starts_on' | 'ends_on'>,
  locale: string,
  today: Date = new Date(),
): string {
  const start = fromIso(closure.starts_on);
  const end = fromIso(closure.ends_on);
  const thisYear =
    start.getFullYear() === today.getFullYear() && end.getFullYear() === today.getFullYear();
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
  const full = thisYear
    ? dayMonth
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  if (closure.starts_on === closure.ends_on) return full.format(start);
  if (start.getFullYear() !== end.getFullYear())
    return `${full.format(start)} – ${full.format(end)}`;
  if (start.getMonth() !== end.getMonth()) return `${dayMonth.format(start)} – ${full.format(end)}`;
  return `${start.getDate()}–${full.format(end)}`;
}

/**
 * Whole days in a closure, both ends counted. Counted on UTC calendar days, so
 * a clock change inside the range cannot make a day 23 or 25 hours long.
 */
export function closureDayCount(closure: Pick<AcademyClosure, 'starts_on' | 'ends_on'>): number {
  return (utcDay(closure.ends_on) - utcDay(closure.starts_on)) / 86_400_000 + 1;
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `YYYY-MM-DD` as local midnight: the calendar day, not a UTC instant. */
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
