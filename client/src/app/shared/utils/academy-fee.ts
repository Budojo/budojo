import { Academy } from '../../core/services/academy.service';

/**
 * Does this academy manage monthly payments in Budojo at all? (#1381)
 *
 * Until the price list existed this was simply `monthly_fee_cents !== null`,
 * and the two statements were the same thing. They no longer are: an academy
 * that prices entirely by tier leaves the flat fee empty, and every surface
 * still asking the old question — the paid badge, the paid filter, the unpaid
 * widget — would go blank on an academy that plainly charges its athletes.
 *
 * The single client mirror of `Academy::scopeChargingAFee()` on the server, so
 * the two cannot answer differently. A zero fee counts: an owner who has
 * deliberately set it to nothing is still tracking who has paid.
 */
export function academyChargesAFee(academy: Academy | null | undefined): boolean {
  if (!academy) return false;
  return (academy.monthly_fee_cents ?? null) !== null || (academy.fee_tier_count ?? 0) > 0;
}
