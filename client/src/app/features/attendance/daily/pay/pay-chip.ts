import { Athlete } from '../../../../core/services/athlete.service';

/**
 * What the check-in's payment chip says about one athlete (#2036, PRD § 6.1).
 *
 * - `due`: the oldest month they owe. Once they are marked present it reads
 *   «Da chiedere»: the check-in knows who is standing in front of you.
 * - `free`: they train free (their own fee is zero).
 * - `carnet`: a carnet pays for this month, with its entries left.
 * - `covered`: a fee's period pays for this month and nothing is behind.
 */
export type PayChip =
  | { readonly kind: 'due'; readonly month: string }
  | { readonly kind: 'free' }
  | { readonly kind: 'carnet'; readonly left: number }
  | { readonly kind: 'covered' };

/** A month as the server writes it: `2026-09`. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-09` as the year and the 1-based month the payments API takes. */
export function yearMonthOf(month: string): { year: number; month: number } {
  const [year, m] = month.split('-').map(Number);
  return { year, month: m };
}

/** The months a payment recorded on `month` pays for, `period` months long. */
export function monthsCovered(month: string, period: number): string[] {
  const { year, month: m } = yearMonthOf(month);
  return Array.from({ length: Math.max(1, period) }, (_, i) =>
    monthOf(new Date(year, m - 1 + i, 1)),
  );
}

/**
 * What pays for this month, as the server resolved it (#1402). A payload
 * older than `payment_coverage` falls back to `paid_current_month`, and one
 * with neither is not known: no chip says anything about it.
 */
function coverageOf(athlete: Athlete): 'none' | 'carnet' | 'fee' | null {
  const coverage = athlete.payment_coverage;
  if (coverage !== undefined) {
    return coverage === 'none' ? 'none' : coverage === 'carnet' ? 'carnet' : 'fee';
  }
  if (athlete.paid_current_month === undefined) return null;
  return athlete.paid_current_month ? 'fee' : 'none';
}

/**
 * The months this athlete owes, oldest first.
 *
 * `behind` is what the arrears list says, which never holds the current
 * month (#1760). This month is owed when nothing pays it and their billing
 * floor has reached it. `paidHere` is what this screen recorded since it
 * loaded: the roster's coverage is from before those payments.
 */
export function owedMonths(
  athlete: Athlete,
  behind: readonly string[],
  thisMonth: string,
  paidHere: ReadonlySet<string>,
): string[] {
  const months = new Set(behind);
  const floor = athlete.billing_floor?.slice(0, 7) ?? null;
  if (coverageOf(athlete) === 'none' && (floor === null || floor <= thisMonth)) {
    months.add(thisMonth);
  }
  return [...months].filter((month) => !paidHere.has(month)).sort();
}

/**
 * The chip for one athlete, or `null` when there is none to show: the
 * owner's own row, no fee that applies, a month their billing floor has not
 * reached, or a payload that does not say.
 */
export function payChipOf(
  athlete: Athlete,
  behind: readonly string[],
  thisMonth: string,
  paidHere: ReadonlySet<string>,
): PayChip | null {
  if (athlete.is_self) return null;
  const fee = athlete.monthly_fee_cents;
  if (fee === null || fee === undefined) return null;
  if (fee === 0) return { kind: 'free' };
  const owed = owedMonths(athlete, behind, thisMonth, paidHere);
  if (owed.length > 0) return { kind: 'due', month: owed[0] };
  if (paidHere.has(thisMonth)) return { kind: 'covered' };
  const coverage = coverageOf(athlete);
  if (coverage === null || coverage === 'none') return null;
  if (coverage === 'carnet' && athlete.active_carnet) {
    return { kind: 'carnet', left: athlete.active_carnet.remaining_entries };
  }
  return { kind: 'covered' };
}
