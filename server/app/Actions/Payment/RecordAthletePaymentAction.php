<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Enums\BillingPeriod;
use App\Enums\PaymentMethod;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Notifications\AthletePaymentMarkedPaidNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RecordAthletePaymentAction
{
    public function __construct(
        private readonly WritePaymentRowAction $writeRow,
    ) {
    }

    /**
     * Records a payment for the given (athlete, year, month). Idempotent:
     * if a row already exists, returns it instead of creating a duplicate
     * (`WritePaymentRowAction`, which also refuses an overlapping period and
     * rebuilds the carnets the payment frees).
     *
     * `amountCents` is supplied by the caller — the controller passes what
     * `App\Support\MonthlyFee::forAthlete()` resolves (the athlete's own
     * fee, #1757, else their price tier, else the academy's flat
     * `monthly_fee_cents`, #1381) after verifying it is non-null. Snapshotting at the
     * call site means future fee or tier changes do NOT rewrite past
     * records.
     *
     * Side effect: if the row was just CREATED (not idempotent re-read),
     * the linked athlete user receives the
     * `athlete_payment_marked_paid` notification (#729 B3). The
     * `wasRecentlyCreated` flag is the canonical Eloquent way to tell
     * which branch of `createOrFirst` returned — same shape used in
     * other observers.
     *
     * `$paidAt` is the day the money arrived (#1761), stored as the start of
     * that day; null means today — the owner's today (#1963), stored the
     * same way. Rows from before #1761 carry the moment they were recorded
     * instead. It is the transaction's date, **never** the
     * month the revenue belongs to — `(year, month)` and the period decide
     * that, and the chart buckets by them.
     */
    public function execute(
        Athlete $athlete,
        int $year,
        int $month,
        int $amountCents,
        BillingPeriod $period = BillingPeriod::Monthly,
        ?CarbonImmutable $paidAt = null,
        ?PaymentMethod $method = null,
    ): AthletePayment {
        $payment = $this->writeRow->execute(new AthletePayment([
            'athlete_id' => $athlete->id,
            'year' => $year,
            'month' => $month,
            'period_months' => $period,
            'amount_cents' => $amountCents,
            'paid_at' => $paidAt?->startOfDay() ?? OperatorDay::today(),
            'payment_method' => $method,
            'waived' => false,
        ]));

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
