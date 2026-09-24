import type { TrainingMode } from '../../core/services/academy.service';

/**
 * Dates a timetable class comes round on (#1859).
 *
 * The timetable is a recurring week and carries no dates; planning ahead has
 * to turn "Monday, 19:00" into the Mondays of a window. Dates are `Y-m-d`
 * strings throughout, and the arithmetic is done in UTC so a daylight-saving
 * change never turns one day into two or none.
 */

/** A `Y-m-d` string `days` days after (or before) `iso`. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The local calendar day of `date`, as `Y-m-d` — "today" as the owner reads it. */
export function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Every date in `[from, to]` on which a class with this `weekday` runs.
 * `weekday` is Carbon's `dayOfWeek` — 0 is Sunday — as on the timetable.
 */
export function occurrencesOf(klass: { readonly weekday: number }, from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const fromDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const ahead = (klass.weekday - fromDay + 7) % 7;

  const dates: string[] = [];
  for (let date = addDays(from, ahead); date <= to; date = addDays(date, 7)) {
    dates.push(date);
  }
  return dates;
}

/**
 * Whether a class of `classKind` may be told to teach a topic of `topicKind`:
 * the rule of `TrainingMode::admittedTopicModes()` on the server. A mode
 * admits itself and `both`; `both` and `other` narrow nothing.
 */
export function admitsTopic(classKind: TrainingMode, topicKind: TrainingMode): boolean {
  if (classKind === 'both' || classKind === 'other') return true;
  return topicKind === classKind || topicKind === 'both';
}
