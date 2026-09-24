import { AcademyClass } from '../../core/services/academy-class.service';

/**
 * Date arithmetic for the Today screen (#1643), kept out of the component so
 * it can be tested against a fixed clock.
 *
 * Every function reads the LOCAL calendar: "today" is the day on the owner's
 * wall, and `toISOString()` would move a late-evening Thursday into Friday
 * for anyone east of Greenwich.
 */

/** `YYYY-MM-DD` of the local calendar day. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The classes that run on the date's weekday, in the order the server sent
 * them (by start time, untimed last). `weekday` is Carbon's `dayOfWeek`,
 * 0 = Sunday, the same as `Date.getDay()`.
 */
export function tonightClasses(
  classes: readonly AcademyClass[],
  date: Date,
): readonly AcademyClass[] {
  return classes.filter((c) => c.weekday === date.getDay());
}

/**
 * The first class on a day AFTER today, and the date it falls on — the answer
 * to "when is the next lesson" on an evening with none. A week at most: a
 * timetable repeats weekly, so if nothing runs in the next seven days nothing
 * ever does.
 */
export function nextClassAfter(
  classes: readonly AcademyClass[],
  now: Date,
): { readonly academyClass: AcademyClass; readonly date: Date } | null {
  for (let ahead = 1; ahead <= 7; ahead++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    const first = tonightClasses(classes, date)[0];
    if (first !== undefined) return { academyClass: first, date };
  }

  return null;
}

/** Midnight of the Monday that starts the date's week. Sunday ends a week. */
export function weekStart(date: Date): Date {
  const sinceMonday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday);
}

/** The presences recorded from `fromIso` on, from the daily stats series. */
export function presencesSince(
  points: readonly { readonly date: string; readonly count: number }[],
  fromIso: string,
): number {
  return points.filter((p) => p.date >= fromIso).reduce((sum, p) => sum + p.count, 0);
}

/**
 * The athletes who joined between `fromIso` and `toIso`, both included.
 * `joined_at` accepts a future date — someone pre-registered for next month —
 * and that person has not joined this week: the upper bound keeps them out
 * until the day comes.
 */
export function joinedSince<T extends { readonly joined_at: string }>(
  athletes: readonly T[],
  fromIso: string,
  toIso: string,
): T[] {
  return athletes.filter((a) => a.joined_at >= fromIso && a.joined_at <= toIso);
}

/** "19:00–20:30", "19:00" without a length, `null` without a start. */
export function timeRange(c: AcademyClass): string | null {
  if (c.starts_at === null) return null;
  if (c.duration_minutes === null) return c.starts_at;

  const [h, m] = c.starts_at.split(':').map(Number);
  const end = (h * 60 + m + c.duration_minutes) % (24 * 60);
  const hh = String(Math.floor(end / 60)).padStart(2, '0');
  const mm = String(end % 60).padStart(2, '0');

  return `${c.starts_at}–${hh}:${mm}`;
}
