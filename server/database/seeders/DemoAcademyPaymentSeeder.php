<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AthleteStatus;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * Seeds 12 months of athlete_payments rows for the demo academy so the
 * Stats > Payments revenue chart shows a populated trend instead of an
 * empty bar series. Each athlete pays for most months in the trailing
 * 12-month window with deliberate gaps:
 *
 * - Active athletes: pay 10-12 of the last 12 months (random gaps)
 * - Suspended athletes: pay 6-8 of the last 12 months, no payments in
 *   the most recent month (mimics "stopped paying when paused")
 * - Inactive athletes: pay 4-6 of the last 12 months, no payments in
 *   the most recent 2-3 months (mimics "left the academy")
 *
 * `amount_cents` is snapshotted from the academy's monthly_fee_cents
 * — the same path the production POST /payments endpoint uses.
 *
 * Local-only — no-op outside `local`/`testing` environments.
 */
class DemoAcademyPaymentSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('DemoAcademyPaymentSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $admin = User::where('email', 'admin@example.it')->first();
        $academy = $admin?->academy;
        if ($academy === null) {
            throw new \RuntimeException('DemoAcademyPaymentSeeder requires the admin academy — run the academy seeders first.');
        }
        if ($academy->monthly_fee_cents === null) {
            throw new \RuntimeException('DemoAcademyPaymentSeeder requires academy.monthly_fee_cents — fixture must set it.');
        }

        // Fresh start: drop existing payments for this academy's athletes.
        AthletePayment::whereIn(
            'athlete_id',
            Athlete::where('academy_id', $academy->id)->pluck('id'),
        )->delete();

        $today = CarbonImmutable::now();
        $athletes = Athlete::where('academy_id', $academy->id)->get();

        $rows = [];
        foreach ($athletes as $athlete) {
            $skipMonths = match ($athlete->status) {
                AthleteStatus::Active => random_int(0, 2),
                AthleteStatus::Suspended => random_int(4, 6),
                AthleteStatus::Inactive => random_int(6, 8),
            };
            $skipMostRecent = match ($athlete->status) {
                AthleteStatus::Active => 0,
                AthleteStatus::Suspended => 1,
                AthleteStatus::Inactive => random_int(2, 3),
            };

            // Build candidate (year, month) tuples for the trailing 12 months.
            $candidates = [];
            for ($i = $skipMostRecent; $i < 12; $i++) {
                $cursor = $today->subMonths($i);
                // Skip if athlete joined after this month.
                $joined = CarbonImmutable::parse($athlete->joined_at);
                if ($joined->greaterThan($cursor->endOfMonth())) {
                    continue;
                }
                $candidates[] = ['year' => (int) $cursor->format('Y'), 'month' => (int) $cursor->format('m')];
            }

            // Randomly drop $skipMonths from the candidates (gaps).
            if ($skipMonths > 0 && \count($candidates) > $skipMonths) {
                $keys = array_rand($candidates, \count($candidates) - $skipMonths);
                $keys = \is_array($keys) ? $keys : [$keys];
                $candidates = array_values(array_intersect_key($candidates, array_flip($keys)));
            }

            foreach ($candidates as $bucket) {
                $rows[] = [
                    'athlete_id' => $athlete->id,
                    'year' => $bucket['year'],
                    'month' => $bucket['month'],
                    'amount_cents' => $academy->monthly_fee_cents,
                    'paid_at' => $today,
                    'created_at' => $today,
                    'updated_at' => $today,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            AthletePayment::insert($chunk);
        }
    }
}
