<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Notifications\AthletePaymentOverdueNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Monthly push reminder to every athlete with an unpaid current-month
 * fee, sent on the 6th at 09:00 Europe/Rome — well past the standard
 * month-start payment window, well before the owner's day-16 digest
 * (#729 B4). Counterpart to `SendUnpaidAthletesDigest`: that one tells
 * the owner about every athlete; this tells each athlete personally.
 *
 * Eligibility:
 *   - Academy has `monthly_fee_cents` > 0 (zero / null skips the
 *     academy wholesale — no fee = no reminder).
 *   - Athlete is `active` (other statuses are out of scope —
 *     suspended athletes aren't expected to pay).
 *   - Athlete has a linked user_id (invite-pending rows skipped).
 *   - No `AthletePayment` row for (athlete, current year, current
 *     month).
 *   - User has `athlete_payment_overdue` enabled.
 *
 * Best-effort per-athlete: a single notify() failure logs + continues
 * (the next monthly run picks it up if it persists).
 */
class SendAthletePaymentOverduePushes extends Command
{
    /** @var string */
    protected $signature = 'budojo:send-athlete-payment-overdue-pushes';

    /** @var string */
    protected $description = 'Push athlete a reminder when their current-month fee is unpaid past day 6 (#729 B4).';

    public function handle(): int
    {
        // The scheduler runs at 09:00 Europe/Rome — anchor the date in
        // the same timezone so the year/month below match operator
        // intent regardless of `config('app.timezone')` drift. Copilot #731.
        $tz = config('app.timezone');
        $today = Carbon::today(\is_string($tz) ? $tz : null);
        $year = (int) $today->year;
        $month = (int) $today->month;
        $hasFailures = false;

        Academy::query()
            ->whereNotNull('monthly_fee_cents')
            ->where('monthly_fee_cents', '>', 0)
            ->each(function (Academy $academy) use ($year, $month, &$hasFailures): void {
                try {
                    $this->processAcademy($academy, $year, $month);
                } catch (\Throwable $e) {
                    $hasFailures = true;
                    Log::warning('athlete_payment_overdue fanout failed for academy', [
                        'academy_id' => $academy->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            });

        return $hasFailures ? Command::FAILURE : Command::SUCCESS;
    }

    private function processAcademy(Academy $academy, int $year, int $month): void
    {
        $athletes = $academy->athletes()
            ->where('status', AthleteStatus::Active)
            // Owner-as-athlete rows (#748) are not billed — exclude
            // them from the overdue push pipeline. The owner's `is_self`
            // row carries `user_id` but is never expected to pay.
            ->where('is_self', false)
            ->whereNotNull('user_id')
            ->with('user')
            ->get();
        if ($athletes->isEmpty()) {
            return;
        }

        $paidAthleteIds = AthletePayment::query()
            ->whereIn('athlete_id', $athletes->pluck('id'))
            ->where('year', $year)
            ->where('month', $month)
            ->pluck('athlete_id');
        /** @var array<int, true> $paidSet */
        $paidSet = [];
        foreach ($paidAthleteIds as $id) {
            if (is_numeric($id)) {
                $paidSet[(int) $id] = true;
            }
        }

        foreach ($athletes as $athlete) {
            if (isset($paidSet[$athlete->id])) {
                continue;
            }
            $user = $athlete->user;
            if ($user === null) {
                continue;
            }
            if (! NotificationPreferences::isEnabled($user, NotificationCategory::ATHLETE_PAYMENT_OVERDUE)) {
                continue;
            }

            try {
                $user->notify(new AthletePaymentOverdueNotification($academy, $year, $month));
            } catch (\Throwable $e) {
                Log::warning('athlete_payment_overdue notification failed', [
                    'academy_id' => $academy->id,
                    'athlete_id' => $athlete->id,
                    'user_id' => $user->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        }
    }
}
