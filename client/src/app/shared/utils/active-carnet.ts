import type { Carnet } from '../../core/services/carnet.service';

/**
 * The carnet the athlete's next session will actually be charged against
 * (#1364), or `null` when they hold none that is spendable.
 *
 * This is the **client-side mirror of a server rule**, which is why it lives
 * in one place rather than being re-derived at each call site. The server
 * spends the earliest-expiring valid carnet — `Carnet::scopeValidOn` orders
 * by `expires_at` then `id`, and `CarnetAvailability::isActiveOn` decides
 * spendability, which is what the `is_active` flag on the wire already
 * carries. Taking the list's own order instead would show one balance while
 * sessions burned a different carnet, and would disagree with the
 * server-computed `active_carnet` on the roster.
 *
 * The `id` tie-break is not decoration: `expires_at` is derived from the
 * purchase date, so two packs bought on the same day share an expiry, and
 * without it which one the athlete sees would be arbitrary.
 */
export function activeCarnetOf(carnets: readonly Carnet[]): Carnet | null {
  return (
    carnets
      .filter((c) => c.is_active)
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.id - b.id)[0] ?? null
  );
}
