import { closureDayCount, formatClosureRange } from './closure-range';

describe('formatClosureRange (#1766)', () => {
  const today = new Date(2026, 8, 26);

  it('says one day as a date, and what a range shares once, unpadded', () => {
    expect(
      formatClosureRange({ starts_on: '2026-08-15', ends_on: '2026-08-15' }, 'en-GB', today),
    ).toBe('15 August');
    expect(
      formatClosureRange({ starts_on: '2026-09-07', ends_on: '2026-09-09' }, 'it-IT', today),
    ).toBe('7–9 settembre');
    expect(
      formatClosureRange({ starts_on: '2026-09-30', ends_on: '2026-10-04' }, 'it-IT', today),
    ).toBe('30 settembre – 4 ottobre');
  });

  it('names the year only when the range leaves this one', () => {
    expect(
      formatClosureRange({ starts_on: '2026-12-24', ends_on: '2027-01-06' }, 'it-IT', today),
    ).toBe('24 dicembre 2026 – 6 gennaio 2027');
    expect(
      formatClosureRange({ starts_on: '2027-08-09', ends_on: '2027-08-20' }, 'en-GB', today),
    ).toBe('9–20 August 2027');
  });
});

describe('closureDayCount', () => {
  it('counts both ends, across a clock change', () => {
    expect(closureDayCount({ starts_on: '2026-08-15', ends_on: '2026-08-15' })).toBe(1);
    expect(closureDayCount({ starts_on: '2026-08-10', ends_on: '2026-08-25' })).toBe(16);
    // Italy leaves summer time on 25 October 2026.
    expect(closureDayCount({ starts_on: '2026-10-20', ends_on: '2026-10-30' })).toBe(11);
  });
});
