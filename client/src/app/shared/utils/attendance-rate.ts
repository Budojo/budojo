/**
 * Counts the academy's *scheduled* training days that have already occurred in
 * a given calendar month, capped at `today`. The athlete's attendance is
 * compared against THIS denominator, not the calendar-day count: "12 days
 * trained out of 18 scheduled" answers the instructor's question, "12 days
 * out of 30" doesn't.
 *
 * Returns `null` when `trainingDays` is missing — the academy hasn't
 * configured a schedule yet, the caller should fall back to the raw count
 * display.
 *
 * `trainingDays` uses Carbon's `dayOfWeek` convention (0=Sun..6=Sat) — the
 * same wire shape as `Academy.training_days` from #88a.
 *
 * `month` is 1..12 (calendar), not 0-indexed.
 *
 * `today` is injectable so the unit tests are deterministic; in the component
 * we just call `new Date()` at compute-time, which is fine for a feature
 * driven by month boundaries (no second-level precision needed).
 */
export function countScheduledTrainingDays(
  trainingDays: number[] | null | undefined,
  year: number,
  month: number,
  today: Date = new Date(),
): number | null {
  if (!trainingDays || trainingDays.length === 0) {
    return null;
  }

  const allowed = new Set(trainingDays);
  const lastDayOfMonth = new Date(year, month, 0).getDate();

  // Strip time so the comparison is on the calendar day, not the wall clock.
  // Otherwise an instructor checking the page mid-afternoon on a Wednesday
  // would see today excluded if `today` were before midnight UTC and the
  // ISO conversion shifted it.
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let count = 0;
  for (let day = 1; day <= lastDayOfMonth; day++) {
    const candidate = new Date(year, month - 1, day);
    if (candidate.getTime() > todayMidnight.getTime()) {
      // Future days don't count yet — the session hasn't happened.
      break;
    }
    if (allowed.has(candidate.getDay())) {
      count++;
    }
  }

  return count;
}

/**
 * Pure ratio: `attended / scheduled` as a 0..1 float, or `null` when the
 * denominator is missing or zero (caller should hide the percentage UI).
 * Caller decides whether to clamp at 1 — we don't, because an athlete who
 * trained on an off-schedule day should be visible to the instructor as
 * "more than scheduled" (e.g. open mat).
 */
export function attendanceRate(attended: number, scheduled: number | null): number | null {
  if (scheduled === null || scheduled === 0) return null;
  return attended / scheduled;
}
