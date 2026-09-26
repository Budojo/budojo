<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Athlete;

/**
 * What one athlete's monthly fee is (#1381, #1757).
 *
 * The single expression of a rule that would otherwise be re-derived at every
 * call site, in order: the athlete's own fee (`fee_override_cents`, #1757 —
 * the black belt who trains free, the discounted friend), then their price
 * tier's amount, then the academy's own `monthly_fee_cents`. Null means no
 * fee applies at all, and recording a payment is refused.
 *
 * **Written with `??`, never `?:` or a truthiness test.** An override of 0 is
 * a value — this athlete pays nothing — and `?:` would send it on to the tier
 * and re-price a free athlete silently.
 *
 * Static and dependency-free for the same reason as `RoleCapabilities`: it is
 * a rule over data already loaded, with nothing to inject or swap.
 *
 * **Its SQL twins are `Athlete::scopeExpectedToPay`** (tier or flat fee,
 * non-null) **and `Athlete::scopeChargedMoreThanNothing`** (the same, above
 * zero), #1722. Whatever branch lands here lands there too, or the roster
 * shows a dash on a row that `?paid=no`, the digest and the overdue push still
 * chase.
 */
final class MonthlyFee
{
    public static function forAthlete(Athlete $athlete): ?int
    {
        return $athlete->fee_override_cents
            ?? $athlete->feeTier->amount_cents
            ?? $athlete->academy?->monthly_fee_cents;
    }
}
