import { describe, expect, it } from 'vitest';
import { buildCalendarGrid, shiftMonth } from './calendar-grid';

describe('buildCalendarGrid', () => {
  it('returns rows of length 7 in Mon-Sun European order', () => {
    const grid = buildCalendarGrid(2026, 4);
    grid.forEach((row) => expect(row).toHaveLength(7));
  });

  it('pads the first week with nulls before the first of the month', () => {
    // April 2026: 1st falls on Wednesday → Mon=null, Tue=null, Wed=1.
    const grid = buildCalendarGrid(2026, 4);
    expect(grid[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
  });

  it('pads the last week with nulls after the last of the month', () => {
    // April 2026: 30 days, last Thursday → trailing Fri/Sat/Sun null.
    const grid = buildCalendarGrid(2026, 4);
    const lastRow = grid[grid.length - 1];
    expect(lastRow.slice(0, 4)).toEqual([27, 28, 29, 30]);
    expect(lastRow.slice(4)).toEqual([null, null, null]);
  });

  it('contains every day of the month exactly once', () => {
    const grid = buildCalendarGrid(2026, 2);
    const days = grid.flat().filter((d): d is number => d !== null);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe(1);
    expect(days[days.length - 1]).toBe(28);
  });

  it('handles a month that begins on Monday with no leading padding', () => {
    // June 2026 starts on Monday.
    const grid = buildCalendarGrid(2026, 6);
    expect(grid[0][0]).toBe(1);
  });

  it('handles a month that ends on Sunday with no trailing padding', () => {
    // November 2025 ends on Sunday (30th).
    const grid = buildCalendarGrid(2025, 11);
    const lastRow = grid[grid.length - 1];
    expect(lastRow[6]).toBe(30);
  });
});

describe('shiftMonth', () => {
  it('decrements mid-year', () => {
    expect(shiftMonth({ year: 2026, month: 4 }, -1)).toEqual({ year: 2026, month: 3 });
  });

  it('rolls over to the previous year from January', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('increments mid-year', () => {
    expect(shiftMonth({ year: 2026, month: 4 }, 1)).toEqual({ year: 2026, month: 5 });
  });

  it('rolls over to the next year from December', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });
});
