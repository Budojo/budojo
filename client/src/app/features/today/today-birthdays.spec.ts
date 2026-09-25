import { describe, expect, it } from 'vitest';
import { upcomingBirthdays } from './today-birthdays';

function person(id: number, dob: string | null, last = `L${id}`, first = `F${id}`) {
  return { id, first_name: first, last_name: last, date_of_birth: dob };
}

describe('upcomingBirthdays', () => {
  const thursday = new Date(2026, 8, 24, 18, 30); // Thursday 24 September 2026, evening

  it("puts today's first, with the age turned, then the rest of the week in day order", () => {
    const result = upcomingBirthdays(
      [person(1, '1995-09-29'), person(2, '1990-09-24'), person(3, '2001-09-26')],
      thursday,
    );

    expect(result.map((b) => [b.athlete.id, b.ahead, b.turns])).toEqual([
      [2, 0, 36],
      [3, 2, 25],
      [1, 5, 31],
    ]);
    expect(result[1].date).toEqual(new Date(2026, 8, 26));
  });

  it('orders a shared day by name', () => {
    const result = upcomingBirthdays(
      [person(1, '1990-09-24', 'Rossi', 'Mario'), person(2, '1991-09-24', 'Bianchi', 'Luca')],
      thursday,
    );

    expect(result.map((b) => b.athlete.id)).toEqual([2, 1]);
  });

  it('leaves out a birthday that falls on no day of this window', () => {
    // The server's calendar can be a day away near midnight: the day before
    // today and the eighth day are both outside.
    const result = upcomingBirthdays(
      [person(1, '1990-09-23'), person(2, '1990-10-01'), person(3, null), person(4, 'nonsense')],
      thursday,
    );

    expect(result).toEqual([]);
  });

  it('carries the window across the new year', () => {
    const result = upcomingBirthdays([person(1, '1995-01-02')], new Date(2026, 11, 29));

    expect(result.map((b) => [b.ahead, b.turns])).toEqual([[4, 32]]);
  });

  it('finds 29 February on the 29th in a leap year', () => {
    const result = upcomingBirthdays([person(1, '2000-02-29')], new Date(2028, 1, 26));

    expect(result.map((b) => [b.ahead, b.date, b.turns])).toEqual([[3, new Date(2028, 1, 29), 28]]);
  });

  it('puts 29 February on the 28th in a year without one, with the age turned that day', () => {
    const result = upcomingBirthdays([person(1, '2000-02-29')], new Date(2027, 1, 26));

    expect(result.map((b) => [b.ahead, b.date, b.turns])).toEqual([[2, new Date(2027, 1, 28), 27]]);
  });
});
