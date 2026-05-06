<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\PendingEmailChange;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Hourly cleanup of `pending_email_changes` rows whose 24h window
 * has elapsed (#476). Each row carries a one-shot bearer credential;
 * once expired the link cannot redeem (the action's `isExpired()`
 * branch already drops the row on a verify attempt), but a backlog
 * of stale rows would inflate the table forever and make the
 * `UNIQUE(user_id)` upsert path slower than necessary.
 *
 * **Cap.** Hard-stops at 1000 deletes per run. Two reasons:
 *
 * 1. **Defence in depth against a runaway cohort.** A misconfigured
 *    job loop or a future bug that creates pending rows in a tight
 *    loop would, without the cap, lock the table for the duration of
 *    a `DELETE` over 100k rows. Capping makes the cleanup cost
 *    predictable per run.
 * 2. **Hourly cadence absorbs the rest.** If a run hits the cap the
 *    next hour picks up where this left off; a backlog is bounded by
 *    `cap × hours-since-incident` rather than by raw cohort size.
 *
 * **Resilience.** Any uncaught exception is reported and the run
 * exits FAILURE so cron alerts fire — but the deletes that already
 * landed are committed. Unlike the pending-deletions purge there's
 * no per-row Action to fail mid-loop; the only failure mode is a DB
 * connection blip mid-bulk-delete, which is transient.
 *
 * **PII discipline.** Logs only the row count, never the candidate
 * email or user_id. The cron output ends up in operational log
 * aggregators that are not necessarily aligned with the rest of the
 * privacy posture.
 */
class PurgeExpiredEmailChanges extends Command
{
    public const int DELETE_CAP = 1000;

    protected $signature = 'budojo:purge-expired-email-changes {--dry-run : Print what would be purged without touching the DB}';

    protected $description = 'Hourly cleanup of expired email-change verification tokens (#476)';

    public function handle(): int
    {
        $now = Carbon::now();
        $dryRun = (bool) $this->option('dry-run');

        $totalExpected = PendingEmailChange::query()
            ->where('expires_at', '<=', $now)
            ->count();

        if ($totalExpected === 0) {
            $this->info('No expired email-change tokens.');

            return self::SUCCESS;
        }

        $this->info(\sprintf(
            '%s: found %d expired email-change token(s).',
            $dryRun ? 'DRY RUN' : 'Processing',
            $totalExpected,
        ));

        if ($dryRun) {
            return self::SUCCESS;
        }

        try {
            $deleted = PendingEmailChange::query()
                ->where('expires_at', '<=', $now)
                ->limit(self::DELETE_CAP)
                ->delete();

            $this->info("Done. Purged: {$deleted}.");

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->error("FAILED: {$e->getMessage()}");

            return self::FAILURE;
        }
    }
}
