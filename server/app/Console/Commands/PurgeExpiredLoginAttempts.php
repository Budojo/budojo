<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\LoginAttempt;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Daily cleanup of `login_attempts` rows older than 90 days (#430).
 *
 * The audit log is high-write (one row per login attempt, success or
 * failure). Without retention the table grows unbounded; the security
 * signal value drops fast after a couple of weeks anyway, so 90 days
 * is the discipline disclosed in `/privacy` § Sicurezza and the DPA
 * template's data-categories block.
 *
 * **Cap.** Hard-stops at 5000 deletes per run — five times the
 * email-change cleanup cap because login_attempts is materially
 * higher-write. The daily cadence absorbs any backlog: a bounded cap
 * × cap-doubling means even a 100x volume spike clears in days, not
 * months.
 *
 * **Resilience.** Same shape as the existing `purge-expired-*` crons
 * (#223, #476): uncaught exceptions report + FAILURE-exit so the
 * scheduler alerts fire, but already-committed deletes stand.
 *
 * **PII discipline.** Logs only the row count, never the email,
 * IP, or user_id of the rows being purged.
 */
class PurgeExpiredLoginAttempts extends Command
{
    public const int RETENTION_DAYS = 90;
    public const int DELETE_CAP = 5000;

    protected $signature = 'budojo:purge-expired-login-attempts {--dry-run : Print what would be purged without touching the DB}';

    protected $description = 'Daily cleanup of login_attempts rows older than 90 days (#430)';

    public function handle(): int
    {
        $cutoff = Carbon::now()->subDays(self::RETENTION_DAYS);
        $dryRun = (bool) $this->option('dry-run');

        $totalExpected = LoginAttempt::query()
            ->where('created_at', '<', $cutoff)
            ->count();

        if ($totalExpected === 0) {
            $this->info('No expired login attempts.');

            return self::SUCCESS;
        }

        $this->info(\sprintf(
            '%s: found %d login_attempts row(s) older than %d days.',
            $dryRun ? 'DRY RUN' : 'Processing',
            $totalExpected,
            self::RETENTION_DAYS,
        ));

        if ($dryRun) {
            return self::SUCCESS;
        }

        try {
            $deletedRaw = LoginAttempt::query()
                ->where('created_at', '<', $cutoff)
                ->limit(self::DELETE_CAP)
                ->delete();
            $deleted = \is_int($deletedRaw) ? $deletedRaw : 0;

            $this->info("Done. Purged: {$deleted}.");

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->error("FAILED: {$e->getMessage()}");

            return self::FAILURE;
        }
    }
}
