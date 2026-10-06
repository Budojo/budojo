import { Athlete } from '../../../../core/services/athlete.service';
import { owedMonths, payChipOf } from './pay-chip';

/** One row of «Chi deve ancora pagare» (#2132). */
export interface MoneyRow {
  readonly athlete: Athlete;
  /** The month the row names: this month when it is owed, else the oldest. */
  readonly lead: string;
  /** The other months owed, oldest first: «anche agosto». */
  readonly also: readonly string[];
  /** The month the payment sheet opens on: the oldest owed. */
  readonly oldest: string;
}

/** The list, tonight's people first: the ones standing in front of you. */
export interface MoneyRows {
  readonly tonight: readonly MoneyRow[];
  readonly others: readonly MoneyRow[];
}

/**
 * Who still has to pay, in the roster's order, split by who is on the mat
 * today. Someone is listed when the check-in's chip would ask them for a
 * month (`payChipOf`), so the two screens never disagree about who owes.
 */
export function moneyRows(
  athletes: readonly Athlete[],
  behind: ReadonlyMap<number, readonly string[]>,
  thisMonth: string,
  paidHere: ReadonlyMap<number, ReadonlySet<string>>,
  presentToday: ReadonlySet<number>,
): MoneyRows {
  const tonight: MoneyRow[] = [];
  const others: MoneyRow[] = [];
  for (const athlete of athletes) {
    const months = behind.get(athlete.id) ?? [];
    const paid = paidHere.get(athlete.id) ?? new Set<string>();
    if (payChipOf(athlete, months, thisMonth, paid)?.kind !== 'due') continue;

    const owed = owedMonths(athlete, months, thisMonth, paid);
    const lead = owed.includes(thisMonth) ? thisMonth : owed[0];
    const row: MoneyRow = {
      athlete,
      lead,
      also: owed.filter((month) => month !== lead),
      oldest: owed[0],
    };
    (presentToday.has(athlete.id) ? tonight : others).push(row);
  }
  return { tonight, others };
}
