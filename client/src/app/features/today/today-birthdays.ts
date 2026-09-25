import { ageOn, birthdayIn, parseDateOfBirth } from '../../shared/utils/age';

/**
 * The week's birthdays for Today (#1754): today and the six days after it,
 * the window `GET /athletes?birthday=week` answers.
 */
export const BIRTHDAY_WINDOW_DAYS = 7;

export interface Birthday<T> {
  readonly athlete: T;
  /** Days from today: 0 is today, 6 the last day of the window. */
  readonly ahead: number;
  /** The day it falls on, at local midnight. */
  readonly date: Date;
  /** The age turned that day; `null` only for a date of birth after it. */
  readonly turns: number | null;
}

interface Person {
  readonly first_name: string;
  readonly last_name: string;
  readonly date_of_birth: string | null;
}

/**
 * Places each athlete on the day of the window their birthday falls on,
 * today's first, then by day, then by name.
 *
 * The server chose them by its own calendar, and near midnight that can be a
 * day away from the one on the owner's wall: an athlete whose birthday falls
 * on no day of THIS window is left out rather than placed on a wrong one.
 * Each day is matched against the birthday of that day's own year
 * (`birthdayIn`), which is how 29 February lands on the 28th in a year
 * without it, as it does on the server.
 */
export function upcomingBirthdays<T extends Person>(
  athletes: readonly T[],
  today: Date,
): Birthday<T>[] {
  const birthdays: Birthday<T>[] = [];
  for (const athlete of athletes) {
    const dob = athlete.date_of_birth ? parseDateOfBirth(athlete.date_of_birth) : null;
    if (dob === null) continue;
    for (let ahead = 0; ahead < BIRTHDAY_WINDOW_DAYS; ahead++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead);
      const birthday = birthdayIn(dob, date.getFullYear());
      if (date.getMonth() + 1 === birthday.month && date.getDate() === birthday.day) {
        birthdays.push({ athlete, ahead, date, turns: ageOn(athlete.date_of_birth, date) });
        break;
      }
    }
  }

  return birthdays.sort(
    (a, b) =>
      a.ahead - b.ahead ||
      a.athlete.last_name.localeCompare(b.athlete.last_name) ||
      a.athlete.first_name.localeCompare(b.athlete.first_name),
  );
}
