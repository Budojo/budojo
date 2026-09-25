/** A date of birth as its calendar parts — read, never converted from UTC. */
export interface DateOfBirth {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * The calendar day of a `YYYY-MM-DD` date of birth (a timestamp is read by its
 * date part), or `null` when it is not one.
 */
export function parseDateOfBirth(dob: string): DateOfBirth | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * The month and day the birthday falls on in `year` (#1754): the date of
 * birth's own, except for someone born on 29 February, whose birthday is
 * **28 February** in a year without a 29th — otherwise missed three years in
 * four. The roster's `?birthday=` filter (`BirthdayWindow`) holds the same
 * rule, so Today's list and the ages on it agree with the server.
 */
export function birthdayIn(dob: DateOfBirth, year: number): { month: number; day: number } {
  const isLeapYear = new Date(year, 1, 29).getMonth() === 1;
  if (dob.month === 2 && dob.day === 29 && !isLeapYear) return { month: 2, day: 28 };
  return { month: dob.month, day: dob.day };
}

/**
 * Whole years of age on `on`'s local calendar day — the age badge's number,
 * and on a birthday the age being turned (#1754). `null` when the date of
 * birth is missing, malformed or after `on`.
 */
export function ageOn(dob: string | null | undefined, on: Date): number | null {
  if (!dob) return null;
  const parsed = parseDateOfBirth(dob);
  if (!parsed) return null;
  let age = on.getFullYear() - parsed.year;
  // A year fewer while this year's birthday is still to come.
  const birthday = birthdayIn(parsed, on.getFullYear());
  const beforeBirthday =
    on.getMonth() + 1 < birthday.month ||
    (on.getMonth() + 1 === birthday.month && on.getDate() < birthday.day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
