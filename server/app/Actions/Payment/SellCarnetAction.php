<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\Carnet;
use App\Support\CarnetCode;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class SellCarnetAction
{
    /**
     * How long a carnet stays spendable. Stored per carnet at purchase, so
     * changing this never retroactively expires carnets already sold.
     */
    public const VALIDITY_MONTHS = 12;

    private const MAX_CODE_ATTEMPTS = 5;

    public function __construct(
        private readonly CarnetCode $codeGenerator,
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
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
        ?CarbonImmutable $validFrom = null,
    ): Carnet {
        // Validity defaults to the sale, which is what happens when the owner
        // just clicks sell. Setting it earlier is the point of #1380: the
        // carnet then covers sessions already on the register.
        $validFrom ??= $purchasedAt;
        $attributes = [
            'athlete_id' => $athlete->id,
            'total_entries' => $totalEntries,
            'price_cents' => $priceCents,
            'purchased_at' => $purchasedAt->toDateString(),
            'valid_from' => $validFrom->toDateString(),
            // Anchored to `valid_from`, not the sale (#1380): the window is
            // always exactly twelve months, so back-dating it spends validity
            // rather than adding it. NoOverflow so a leap-day start expires on
            // Feb 28 rather than spilling into March 1.
            'expires_at' => $validFrom->addMonthsNoOverflow(self::VALIDITY_MONTHS)->toDateString(),
        ];

        return DB::transaction(function () use ($athlete, $attributes): Carnet {
            $carnet = $this->insertWithFreshCode($attributes);

            // A carnet dated into the past may be owed sessions the register
            // already holds, so the ledger is rebuilt before the row goes back
            // to the caller — otherwise the response would claim a full balance
            // the next read would contradict.
            //
            // Deliberately outside the retry below: it writes to
            // `carnet_entries`, which has a unique index of its own, and a
            // violation raised there must not be mistaken for a code collision
            // and silently retried into a second carnet.
            $this->reconcileCarnets->execute([$athlete->id]);

            // The balance readers require `entries_count` and throw when it is
            // missing, rather than reporting a silently-full carnet.
            return $carnet->loadCount('entries');
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     *
     * @throws \RuntimeException when no free code was found in the attempt budget
     */
    private function insertWithFreshCode(array $attributes): Carnet
    {
        for ($attempt = 1; $attempt <= self::MAX_CODE_ATTEMPTS; $attempt++) {
            try {
                return Carnet::create([
                    'code' => $this->codeGenerator->generate(),
                    ...$attributes,
                ]);
            } catch (UniqueConstraintViolationException) {
                // `code` is the only unique index on `carnets`, so a violation
                // here can only be a collision. Redraw.
            }
        }

        throw new \RuntimeException(
            \sprintf('Could not draw a free carnet code in %d attempts.', self::MAX_CODE_ATTEMPTS),
        );
    }
}
