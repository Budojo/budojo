<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Academy;
use App\Notifications\AthletePaymentOverdueNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\OperatorDay;
use Carbon\CarbonInterface;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Monthly push reminder to every athlete with an unpaid current-month
 * fee, sent on the 6th at 09:00 Europe/Rome — well past the standard
 * month-start payment window, well before the owner's day-16 digest
 * (#729 B4). Counterpart to `SendUnpaidAthletesDigest`: that one tells
 * the owner about every athlete; this tells each athlete personally.
 *
 * Eligibility:
 *   - Academy charges something — a flat `monthly_fee_cents` > 0, a
 *     price tier above zero (#1381), or an athlete's personal fee above
 *     zero (#1757). Zero everywhere skips the academy wholesale: no fee =
 *     nothing owed = no reminder.
 *   - Athlete owes the month, by the roster's own rule
 *     (`Athlete::scopeOwing`, #1722): active, not the owner, charged a
 *     fee, and neither a payment covering the month nor a carnet
 *     spendable today.
 *   - Athlete's own fee is above zero — a free tier is not chased even
 *     where another tier pays (`Athlete::scopeChargedMoreThanNothing`).
 *   - Athlete has a linked user_id (invite-pending rows skipped).
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
        // The owner's day (#1963), not UTC's: this comment used to say so
        // while the code read `app.timezone`, which is UTC.
        $today = OperatorDay::today();
        $year = (int) $today->year;
        $month = (int) $today->month;
        $hasFailures = false;

        Academy::query()
            ->chargingMoreThanNothing()
            ->each(function (Academy $academy) use ($year, $month, $today, &$hasFailures): void {
                try {
                    $this->processAcademy($academy, $year, $month, $today);
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

    private function processAcademy(Academy $academy, int $year, int $month, CarbonInterface $today): void
    {
        // Who owes the month, by the roster's own rule (#1722): the payment
        // covering it (#1382), a spendable carnet, the owner's own row (#748)
        // and an athlete charged no fee are all left alone. Narrower than the
        // owner's list by one clause: a free tier is not chased, for the same
        // reason the academy gate above skips an academy charging zero.
        $athletes = $academy->athletes()
            ->owing($year, $month, $today)
            ->chargedMoreThanNothing()
            ->whereNotNull('user_id')
            ->with('user')
            ->get();

        foreach ($athletes as $athlete) {
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
