<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Notifications\AthletePaymentMarkedPaidNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RecordAthletePaymentAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Records a payment for the given (athlete, year, month). Idempotent:
     * if a row already exists, returns it instead of creating a duplicate.
     *
     * `createOrFirst()` (NOT `firstOrCreate()`) is the atomic shape — it
     * attempts the INSERT first and falls back to a query on a unique
     * constraint violation. The naive read-then-write pattern would race
     * under concurrency: two POSTs could both miss the initial query and
     * then collide on insert, surfacing a 500 instead of returning the
     * existing row. The DB unique index is the safety net that makes this
     * work — see `create_athlete_payments_table` migration.
     *
     * `amountCents` is supplied by the caller — the controller passes what
     * `App\Support\MonthlyFee::forAthlete()` resolves (the athlete's price
     * tier if they are on one, the academy's flat `monthly_fee_cents`
     * otherwise, #1381) after verifying it is non-null. Snapshotting at the
     * call site means future fee or tier changes do NOT rewrite past
     * records.
     *
     * Side effect: if the row was just CREATED (not idempotent re-read),
     * the linked athlete user receives the
     * `athlete_payment_marked_paid` notification (#729 B3). The
     * `wasRecentlyCreated` flag is the canonical Eloquent way to tell
     * which branch of `createOrFirst` returned — same shape used in
     * other observers.
     */
    public function execute(Athlete $athlete, int $year, int $month, int $amountCents): AthletePayment
    {
        // The insert and the rebuild share a transaction: a payment recorded
        // without the ledger catching up leaves exactly the stale balance the
        // derived design exists to prevent.
        $payment = DB::transaction(function () use ($athlete, $year, $month, $amountCents): AthletePayment {
            $payment = AthletePayment::query()->createOrFirst(
                [
                    'athlete_id' => $athlete->id,
                    'year' => $year,
                    'month' => $month,
                ],
                [
                    'amount_cents' => $amountCents,
                    'paid_at' => now(),
                ],
            );

            if ($payment->wasRecentlyCreated) {
                // Paying a month releases whatever that month had taken off a
                // carnet (#1380). Under the old event-driven consumption this
                // discrepancy was accepted on purpose — the rule was evaluated
                // at marking time and never revisited — but once the balance is
                // a function of its inputs, leaving it frozen is the anomaly.
                $this->reconcileCarnets->execute([$athlete->id]);
            }

            return $payment;
        });

        if ($payment->wasRecentlyCreated) {
            $this->notifyAthlete($athlete, $payment);
        }

        return $payment;
    }

    private function notifyAthlete(Athlete $athlete, AthletePayment $payment): void
    {
        $user = $athlete->user;
        if ($user === null) {
            return;
        }
        if (! NotificationPreferences::isEnabled($user, NotificationCategory::ATHLETE_PAYMENT_MARKED_PAID)) {
            return;
        }

        // Wrap in `DB::afterCommit` so a caller that itself wraps
        // this Action in a transaction won't fire the push for a
        // rolled-back payment. Outside a transaction, `afterCommit`
        // fires immediately — no-op for the typical controller path
        // that doesn't pre-wrap. Copilot review on #731.
        DB::afterCommit(function () use ($athlete, $payment, $user): void {
            try {
                $user->notify(new AthletePaymentMarkedPaidNotification($payment));
            } catch (\Throwable $e) {
                Log::warning('athlete_payment_marked_paid notification failed', [
                    'payment_id' => $payment->id,
                    'athlete_id' => $athlete->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        });
    }
}
