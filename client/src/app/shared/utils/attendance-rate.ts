import type { Academy, AcademySchedule } from '../../core/services/academy.service';

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
 * Counts the academy's *scheduled* training days that have already
 * occurred in a given calendar month, capped at `today`. The athlete's
 * attendance is compared against THIS denominator, not the calendar-day
 * count: "12 days trained out of 18 scheduled" answers the instructor's
 * question, "12 days out of 30" doesn't.
 *
 * From #1094 this consumes the full **schedule history** instead of a
 * single `trainingDays` snapshot — so a mid-month schedule change (e.g.
 * Mon/Wed/Fri up to May 31, Tue/Thu from Jun 1) yields the correct
 * per-segment denominator instead of silently rewriting May to today's
 * schedule. Each day in the month is checked against the schedule that
 * was in effect on THAT day.
 *
 * Returns `null` when there's no schedule history at all, OR when the
 * **entire history** is the `training_days: null` sentinel (i.e.
 * "schedule not configured anywhere ever"). A configured row OUTSIDE
 * the visible range is enough to switch the result from `null` to `0`
 * — the denominator is then "known to be zero," not "unknown." The
 * caller treats `null` as "hide the percentage UI; show the raw count".
 *
 * `month` is 1..12 (calendar), not 0-indexed.
 *
 * `today` is injectable so the unit tests are deterministic; in the
 * component we just call `new Date()` at compute-time — month boundaries
 * carry the precision, no second-level needed.
 */
export function countScheduledTrainingDays(
  schedules: readonly AcademySchedule[] | null | undefined,
  year: number,
  month: number,
  today: Date = new Date(),
): number | null {
  if (!schedules || schedules.length === 0) {
    return null;
  }

  // "Is there any configured schedule at all in the history?" — drives
  // the null-vs-zero distinction. A history with ONLY null-training-days
  // rows is "not configured" and must read as null (hide the percentage
  // UI). A history with at least one configured row reads as 0 in a
  // future month — the denominator is known to be zero, not unknown.
  const anyConfiguredAnywhere = schedules.some(
    (s) => s.training_days !== null && s.training_days.length > 0,
  );
  if (!anyConfiguredAnywhere) {
    return null;
  }

  const lastDayOfMonth = new Date(year, month, 0).getDate();

  return countScheduledTrainingDaysBetween(
    schedules,
    new Date(year, month - 1, 1),
    new Date(year, month - 1, lastDayOfMonth),
    today,
  );
}

/**
 * The same count over an arbitrary range (#1455) — `from` and `to`
 * inclusive, both capped at today, since a session in the future has not
 * been missed yet.
 *
 * This is the general shape; `countScheduledTrainingDays` above is the
 * calendar-month case of it. The roster needs the range form because its
 * window differs per ROW: the season, floored at the day that athlete
 * joined (#1484). Both bounds earn their place — the season keeps the
 * number about this year rather than about the gym's whole history, and the
 * joining floor keeps it about the athlete, since measuring someone who
 * arrived in November against September's sessions reports the academy's
 * calendar as if it were their record.
 *
 * Returns `null` on the same "no schedule configured anywhere" condition,
 * and `0` for a range that is entirely in the future — known-to-be-zero
 * rather than unknown, same distinction the month case draws.
 */
export function countScheduledTrainingDaysBetween(
  schedules: readonly AcademySchedule[] | null | undefined,
  from: Date,
  to: Date,
  today: Date = new Date(),
): number | null {
  if (!schedules || schedules.length === 0) {
    return null;
  }

  const anyConfiguredAnywhere = schedules.some(
    (s) => s.training_days !== null && s.training_days.length > 0,
  );
  if (!anyConfiguredAnywhere) {
    return null;
  }

  // Strip time so the comparison is on the calendar day, not the wall
  // clock — otherwise an instructor checking the page mid-afternoon on
  // a training day would see today excluded if the comparison fell
  // before midnight UTC and the ISO conversion shifted it.
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const rawEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const end = rawEnd.getTime() > todayMidnight.getTime() ? todayMidnight : rawEnd;

  let count = 0;
  const candidate = new Date(start.getTime());
  while (candidate.getTime() <= end.getTime()) {
    const schedule = scheduleForDate(schedules, candidate);
    const trainingDays = schedule?.training_days;
    // No schedule in effect (date precedes the academy's history) OR the
    // in-effect schedule is the "not configured" sentinel. Either way the
    // day doesn't contribute.
    if (trainingDays && trainingDays.length > 0 && trainingDays.includes(candidate.getDay())) {
      count++;
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return count;
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

/**
 * Pure ratio: `attended / scheduled` as a 0..1 float, or `null` when
 * the denominator is missing or zero (caller should hide the percentage
 * UI). Caller decides whether to clamp at 1 — we don't, because an
 * athlete who trained on an off-schedule day should be visible to the
 * instructor as "more than scheduled" (e.g. open mat).
 */
export function attendanceRate(attended: number, scheduled: number | null): number | null {
  if (scheduled === null || scheduled === 0) return null;
  return attended / scheduled;
}
