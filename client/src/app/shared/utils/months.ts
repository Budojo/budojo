/**
 * The twelve month names, as translation keys.
 *
 * Extracted from `payments-list.component.ts`, where they were a private
 * const, because the athlete portal needs the same twelve words (#1670) and
 * the alternative was a second copy. A month name is not something two
 * screens should be allowed to disagree about.
 *
 * Keys rather than `toLocaleString`: the owner picks the language with a
 * toggle in the sidebar, and Angular's own date formatting reads `LOCALE_ID`,
 * which this SPA never sets — which is the whole reason #1624 and #1670 exist.
 */
export const MONTH_KEYS = [
  'month.january',
  'month.february',
  'month.march',
  'month.april',
  'month.may',
  'month.june',
  'month.july',
  'month.august',
  'month.september',
  'month.october',
  'month.november',
  'month.december',
] as const;

/**
 * The key for a 1-based month number, as the server sends it.
 *
 * Out-of-range input returns an empty string rather than `undefined`: a
 * template running this through `| translate` would otherwise render the
 * literal word "undefined" at the reader.
 */
export function monthKey(month: number): string {
  return MONTH_KEYS[month - 1] ?? '';
}
