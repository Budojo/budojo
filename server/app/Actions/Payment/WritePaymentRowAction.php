<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\AthletePayment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Puts one row on an athlete's ledger: a fee paid (`RecordAthletePaymentAction`)
 * or a month let off (`WaiveAthleteMonthAction`, #2167). Both cover months, so
 * both obey the same three rules, written once here.
 */
class WritePaymentRowAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Writes `$row` (unsaved, every column set), or hands back the one already
     * there for the same period. `wasRecentlyCreated` tells the two apart.
     *
     * `createOrFirst()` (NOT `firstOrCreate()`) is the atomic shape — it
     * attempts the INSERT first and falls back to a query on a unique
     * constraint violation. The naive read-then-write pattern would race
     * under concurrency: two POSTs could both miss the initial query and
     * then collide on insert, surfacing a 500 instead of returning the
     * existing row. The DB unique index is the safety net that makes this
     * work — see `create_athlete_payments_table` migration.
     *
     * Everything but the key goes in the *values* of `createOrFirst`: a
     * re-post of the same month returns the first row with its first date
     * and method, which is what keeps the double-click idempotent.
     *
     * The insert and the rebuild share a transaction: a row recorded without
     * the ledger catching up leaves exactly the stale balance the derived
     * design exists to prevent.
     */
    public function execute(AthletePayment $row): AthletePayment
    {
        return DB::transaction(function () use ($row): AthletePayment {
            $this->rejectOverlap($row);

            $written = AthletePayment::query()->createOrFirst(
                [
                    'athlete_id' => $row->athlete_id,
                    'year' => $row->year,
                    'month' => $row->month,
                ],
                [
                    'period_months' => $row->period_months,
                    'amount_cents' => $row->amount_cents,
                    'paid_at' => $row->paid_at,
                    'payment_method' => $row->payment_method,
                    'waived' => $row->waived,
                ],
            );

            if ($written->wasRecentlyCreated) {
                // A covered month releases whatever it had taken off a carnet
                // (#1380). Under the old event-driven consumption this
                // discrepancy was accepted on purpose — the rule was evaluated
                // at marking time and never revisited — but once the balance is
                // a function of its inputs, leaving it frozen is the anomaly.
                $this->reconcileCarnets->execute([$row->athlete_id]);
            }

            return $written;
        });
    }

    /**
     * Refuses a period that shares a month with one already recorded (#1382).
     *
     * `UNIQUE(athlete_id, year, month)` used to carry this invariant on its
     * own, because a row was a month. It cannot any more: a March monthly and
     * a February quarterly start in different months and both cover March, so
     * the index waves them through. Losing a structural guarantee to an
     * application check is a real cost — hence the transaction around it, so
     * the read and the insert cannot be interleaved.
     *
     * Re-posting the *same* row is not an overlap: that is the double-click
     * case, and `createOrFirst` returns the existing row. Re-posting the same
     * start month as something else is refused, though — the caller is asking
     * for something else. Silently handing back the quarterly would claim the
     * athlete paid for a year, and handing back a paid month to "let it off"
     * (#2167) would claim the owner gave it away.
     */
    private function rejectOverlap(AthletePayment $row): void
    {
        $clash = AthletePayment::query()
            ->where('athlete_id', $row->athlete_id)
            ->overlapping($row->year, $row->month, $row->period_months->value)
            ->first();

        if ($clash === null) {
            return;
        }

        if ($clash->year === $row->year
            && $clash->month === $row->month
            && $clash->period_months === $row->period_months
            && $clash->waived === $row->waived) {
            return;
        }

        throw ValidationException::withMessages([
            'period_months' => [\sprintf(
                'A payment already covers %04d-%02d.',
                $clash->year,
                $clash->month,
            )],
        ]);
    }
}
