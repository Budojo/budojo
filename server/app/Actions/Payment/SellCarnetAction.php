<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\Carnet;
use App\Support\CarnetCode;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;

class SellCarnetAction
{
    /**
     * How long a carnet stays spendable. Stored per carnet at purchase, so
     * changing this never retroactively expires carnets already sold.
     */
    private const VALIDITY_MONTHS = 12;

    private const MAX_CODE_ATTEMPTS = 5;

    public function __construct(
        private readonly CarnetCode $codeGenerator,
    ) {
    }

    /**
     * Sells one carnet to the athlete. `$totalEntries` and `$priceCents` are
     * supplied by the caller — the controller reads them off the academy
     * config so the values are snapshotted here and never re-derived, which
     * is what keeps a later price change from rewriting sold carnets.
     *
     * The code is drawn at random and the `carnets.code` unique index is the
     * authority on uniqueness: on a collision we simply redraw. The loop is
     * bounded — a keyspace that keeps colliding is a bug worth surfacing, not
     * one to spin on.
     *
     * @throws \RuntimeException when no free code was found in the attempt budget
     */
    public function execute(
        Athlete $athlete,
        int $totalEntries,
        int $priceCents,
        CarbonImmutable $purchasedAt,
    ): Carnet {
        $attributes = [
            'athlete_id' => $athlete->id,
            'total_entries' => $totalEntries,
            'price_cents' => $priceCents,
            'purchased_at' => $purchasedAt->toDateString(),
            'expires_at' => $purchasedAt->addMonths(self::VALIDITY_MONTHS)->toDateString(),
        ];

        for ($attempt = 1; $attempt <= self::MAX_CODE_ATTEMPTS; $attempt++) {
            try {
                return Carnet::create([
                    'code' => $this->codeGenerator->generate(),
                    ...$attributes,
                ]);
            } catch (UniqueConstraintViolationException) {
                // `code` is the only unique index on the table, so this can
                // only be a code collision. Redraw.
            }
        }

        throw new \RuntimeException(
            \sprintf('Could not draw a free carnet code in %d attempts.', self::MAX_CODE_ATTEMPTS),
        );
    }
}
