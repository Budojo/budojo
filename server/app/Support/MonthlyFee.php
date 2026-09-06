<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Athlete;

/**
 * What one athlete's monthly fee is (#1381).
 *
 * The single expression of a rule that would otherwise be re-derived at every
 * call site: an athlete on a price tier pays that tier's amount, an athlete on
 * none pays the academy's own `monthly_fee_cents`. Null means the academy has
 * configured no fee at all, and recording a payment is refused.
 *
 * Static and dependency-free for the same reason as `RoleCapabilities`: it is
 * a rule over data already loaded, with nothing to inject or swap.
 *
 * Kept deliberately narrow. The per-athlete override the owner asked for — a
 * black belt who trains free — is the next slice, and it lands here as one
 * more branch rather than as a second rule somewhere else.
 */
final class MonthlyFee
{
    public static function forAthlete(Athlete $athlete): ?int
    {
        $tier = $athlete->feeTier;
        if ($tier !== null) {
            return $tier->amount_cents;
        }

        return $athlete->academy?->monthly_fee_cents;
    }
}
