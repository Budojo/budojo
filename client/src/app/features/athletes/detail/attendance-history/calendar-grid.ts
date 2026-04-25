/**
 * Months are 1-indexed on the public API to match the YYYY-MM-DD wire format;
 * we drop into JS's 0-indexed `Date` constructor only at the boundary.
 */

export interface YearMonth {
  year: number;
  month: number;
}

export function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const daysInMonth = lastOfMonth.getDate();

  // Mon-first: JS getDay() has Sunday=0; (getDay() + 6) % 7 maps to Mon=0..Sun=6.
  const startOffset = (firstOfMonth.getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export function shiftMonth(current: YearMonth, delta: number): YearMonth {
  const totalMonths = current.year * 12 + (current.month - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { year, month };
}
