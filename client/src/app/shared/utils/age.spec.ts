import { describe, expect, it } from 'vitest';
import { ageOn, birthdayIn, parseDateOfBirth } from './age';

describe('ageOn', () => {
  const on = new Date(2026, 3, 25); // 25 April 2026

  it('counts the whole years once the birthday has passed this year', () => {
    expect(ageOn('1990-01-15', on)).toBe(36);
  });

  it('counts one fewer while the birthday is still to come', () => {
    expect(ageOn('1990-05-01', on)).toBe(35);
  });

  it('counts the new year on the birthday itself: the age they turn', () => {
    expect(ageOn('1990-04-25', on)).toBe(36);
  });

  it('reads a timestamp by its date part', () => {
    expect(ageOn('1990-04-25T00:00:00.000000Z', on)).toBe(36);
  });

  it('turns someone born on 29 February a year older on the 28th in a year without one', () => {
    expect(ageOn('2000-02-29', new Date(2027, 1, 27))).toBe(26);
    expect(ageOn('2000-02-29', new Date(2027, 1, 28))).toBe(27);
  });

  it('keeps it on the 29th in a leap year', () => {
    expect(ageOn('2000-02-29', new Date(2028, 1, 28))).toBe(27);
    expect(ageOn('2000-02-29', new Date(2028, 1, 29))).toBe(28);
  });

  it('has no answer for a missing, malformed or future date', () => {
    expect(ageOn(null, on)).toBeNull();
    expect(ageOn('', on)).toBeNull();
    expect(ageOn('not-a-date', on)).toBeNull();
    expect(ageOn('2030-01-01', on)).toBeNull();
  });
});

describe('birthdayIn', () => {
  it('is the date of birth itself in any ordinary case', () => {
    expect(birthdayIn({ year: 1990, month: 3, day: 14 }, 2027)).toEqual({ month: 3, day: 14 });
  });

  it('moves 29 February to the 28th in a year without it, and only then', () => {
    const leapling = { year: 2000, month: 2, day: 29 };
    expect(birthdayIn(leapling, 2027)).toEqual({ month: 2, day: 28 });
    expect(birthdayIn(leapling, 2028)).toEqual({ month: 2, day: 29 });
    // A century is not a leap year unless it divides by 400.
    expect(birthdayIn(leapling, 2100)).toEqual({ month: 2, day: 28 });
  });
});

describe('parseDateOfBirth', () => {
  it('splits the calendar day, never converting it', () => {
    expect(parseDateOfBirth('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
  });

  it('refuses a month or a day out of range', () => {
    expect(parseDateOfBirth('2000-13-01')).toBeNull();
    expect(parseDateOfBirth('2000-01-32')).toBeNull();
  });
});
