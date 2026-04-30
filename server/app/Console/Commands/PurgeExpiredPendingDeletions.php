<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\User\PurgeAccountAction;
use App\Models\PendingDeletion;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * GDPR Art. 17 follow-through (#223). Walks every `pending_deletions`
 * row whose `scheduled_for` is in the past and runs
 * `PurgeAccountAction` against the linked user. Idempotent — the
 * Action drops the user (and the cascade-deletes the pending row
 * with it via FK), so a second invocation finds nothing to do.
 *
 * Scheduled from `routes/console.php` to run hourly. Hourly is a
 * compromise: the grace window is 30 days, so the user-visible
 * latency between expiry and actual purge is at most 1 hour, well
 * within the GDPR "without undue delay" reading. Daily would be
 * fine too; hourly gives us a tighter audit trail.
 *
 * **Resilience:** failures are logged and DO NOT stop the loop.
 * If user A's purge throws (a deadlock, a disk-permission glitch
 * on the document-wipe pass), the command keeps going on user B —
 * the next hourly run will retry A. Without the try/catch a single
 * stuck row would block every other user's deletion.
 */
class PurgeExpiredPendingDeletions extends Command
{
    /**
     * The signature uses `--dry-run` so an oncall can preview the
     * impact in production before letting the cron rip.
     */
    protected $signature = 'budojo:purge-expired-pending-deletions {--dry-run : Print what would be purged without touching the DB or disk}';

    protected $description = 'Hard-deletes user accounts whose 30-day grace window has elapsed (#223)';

    public function __construct(
        private readonly PurgeAccountAction $purge,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = Carbon::now();
        $dryRun = (bool) $this->option('dry-run');

        $expired = PendingDeletion::query()
            ->where('scheduled_for', '<=', $now)
            ->with('user')
            ->get();

        if ($expired->isEmpty()) {
            $this->info('No expired pending deletions.');

            return self::SUCCESS;
        }

        $this->info(\sprintf(
            '%s: found %d expired pending deletion(s).',
            $dryRun ? 'DRY RUN' : 'Processing',
            $expired->count(),
        ));

        $purged = 0;
        $failed = 0;

        foreach ($expired as $pending) {
            // The FK is `cascadeOnDelete`, so `$pending->user` is
            // typed non-null and an orphan row cannot exist via
            // the normal lifecycle. If raw SQL outside the framework
            // ever hand-deleted a user row, the next pass'd surface
            // the orphan as a Throwable on `$this->purge->execute`
            // and the resilient catch block below logs it without
            // blocking the rest of the cohort.
            $user = $pending->user;

            if ($dryRun) {
                $this->line("would purge user #{$user->id} ({$user->email})");

                continue;
            }

            try {
                $this->purge->execute($user);
                ++$purged;
                $this->line("purged user #{$user->id} ({$user->email})");
            } catch (\Throwable $e) {
                ++$failed;
                report($e); // Sentry / log channel will pick it up when configured.
                $this->error("FAILED user #{$user->id}: {$e->getMessage()}");
            }
        }

        $this->info("Done. Purged: {$purged}. Failed: {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
