/*
 * Which days are training days, for painting them (#1094, #1766).
 *
 * This was `attendance-rate.ts`, and it counted the denominators of every
 * attendance rate in the browser. Since #1764–#1769 the server does that
 * (`App\Support\ScheduledDays`) and sends the numbers; what stays here is
 * the per-day predicate the calendar and the check-in paint with.
 */

import type { Academy, AcademyClosure, AcademySchedule } from '../../core/services/academy.service';

/**
 * Returns `YYYY-MM-DD` for the local-time calendar day of `d`. Used to
 * compare a calendar candidate against `AcademySchedule.effective_from`
 * (which is itself a `YYYY-MM-DD` string). Lex comparison on this format
 * matches calendar order, so we don't need a date library.
 */
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolves the schedule row in effect on a given calendar day (#1094).
 * Mirrors the BE `Academy::scheduleForDate(Carbon $date)` helper: returns
 * the row with the largest `effective_from <= candidate`, or `null` if
 * no row covers the candidate.
 *
 * `schedules` is the wire shape from `AcademyResource` — ordered
 * most-recent-`effective_from` first. We walk top-down and return the
 * first row at or before the candidate.
 */
export function scheduleForDate(
  schedules: readonly AcademySchedule[] | null | undefined,
  candidate: Date,
): AcademySchedule | null {
  if (!schedules || schedules.length === 0) {
    return null;
  }
  const candidateIso = toLocalIsoDate(candidate);
  for (const schedule of schedules) {
    if (schedule.effective_from <= candidateIso) {
      return schedule;
    }
  }
  return null;
}

/**
 * The closure a calendar day falls in (#1766), or null. Ends are inclusive,
 * and overlapping closures are fine: the first match answers. Mirrors
 * `App\Support\ScheduledDays` on the server, where a closed day is never a
 * scheduled one.
 */
export function closureOn(
  closures: readonly AcademyClosure[] | null | undefined,
  candidate: Date,
): AcademyClosure | null {
  if (!closures || closures.length === 0) return null;
  const iso = toLocalIsoDate(candidate);
  return closures.find((c) => c.starts_on <= iso && iso <= c.ends_on) ?? null;
}

/**
 * Bridges the schedule-history (#1094) read path against pre-1094
 * fixtures / wire shapes that only carry `training_days`. Returns:
 *
 *   - `academy.schedules` verbatim when the new shape is present
 *   - a one-row synthetic history covering all time, derived from
 *     `academy.training_days`, when only the old shape is available
 *   - `null` when neither field is present
 *
 * The synthetic row's `effective_from` is `'1970-01-01'` — a date
 * guaranteed to be before any candidate the call sites will pass in,
 * so `scheduleForDate()` resolves to it for every day.
 *
 * Centralises the back-compat so the callers stay one-liners.
 */
export function schedulesForAcademy(
  academy: Pick<Academy, 'schedules' | 'training_days'> | null | undefined,
): readonly AcademySchedule[] | null {
  if (!academy) return null;
  if (academy.schedules && academy.schedules.length > 0) {
    return academy.schedules;
  }
  if (academy.training_days !== undefined) {
    return [
      {
        id: 0,
        training_days: academy.training_days ?? null,
        effective_from: '1970-01-01',
      },
    ];
  }
  return null;
}
