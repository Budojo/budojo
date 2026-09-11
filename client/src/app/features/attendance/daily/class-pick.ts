import { AcademyClass } from '../../../core/services/academy-class.service';

/** Minutes since midnight for an `HH:MM` string. */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * How long a class is assumed to run when the owner gave it a start but no
 * duration — an hour is what a jiu-jitsu class is until somebody says
 * otherwise. Only used to decide whether a class is "on right now".
 */
const DEFAULT_DURATION_MINUTES = 60;

/**
 * Which class the check-in should open on (#1562).
 *
 * The instructor opens the page standing on the mat, minutes before class:
 * the one that is running now, or failing that the one starting nearest to
 * the clock, is the one they mean. Ties go to the earlier class.
 *
 * Any other day — backfilling last Monday on a Wednesday — opens on the
 * day's first class, because backfilling goes in order and the clock says
 * nothing about a day that is not today.
 *
 * Classes with no clock time are only picked when nothing timed exists that
 * day; `classes` arrives in the server's order (timed first, by time), so the
 * first element is the right one whenever the clock has nothing to say.
 */
export function pickDefaultClass(
  classes: readonly AcademyClass[],
  date: Date,
  now: Date,
): AcademyClass | null {
  if (classes.length === 0) return null;
  if (!sameDay(date, now)) return classes[0];

  const timed = classes.filter(
    (c): c is AcademyClass & { starts_at: string } => c.starts_at !== null,
  );
  if (timed.length === 0) return classes[0];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const running = timed.find((c) => {
    const start = minutesOf(c.starts_at);
    const end = start + (c.duration_minutes ?? DEFAULT_DURATION_MINUTES);
    return start <= nowMinutes && nowMinutes < end;
  });
  if (running) return running;

  let best = timed[0];
  let bestDistance = Math.abs(minutesOf(best.starts_at) - nowMinutes);
  for (const candidate of timed.slice(1)) {
    const distance = Math.abs(minutesOf(candidate.starts_at) - nowMinutes);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
