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
 *
 * **Streaming:** processes the expired cohort via `chunkById(50)`
 * so a backlog of thousands of expired accounts (after a long
 * outage of the cron, say) does not load the whole set into memory
 * at once.
 *
 * **PII discipline:** logs only `user_id`, never the email address.
 * The cron output ends up in operational log aggregators that are
 * not necessarily aligned with the GDPR-erasure pipeline; the
 * minimum identifier sufficient to investigate is the row id.
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

        $totalExpected = PendingDeletion::query()
            ->where('scheduled_for', '<=', $now)
            ->count();

        if ($totalExpected === 0) {
            $this->info('No expired pending deletions.');

            return self::SUCCESS;
        }

        $this->info(\sprintf(
            '%s: found %d expired pending deletion(s).',
            $dryRun ? 'DRY RUN' : 'Processing',
            $totalExpected,
        ));

        $purged = 0;
        $failed = 0;

        // chunkById streams the cohort in batches of 50 — no full-
        // cohort load into memory. The eager-loaded `user` relation
        // dodges N+1 inside each chunk. NOTE: the loop body deletes
        // rows from the same table the chunker is paginating, but
        // chunkById is keyset-paginated on `id` ASC, so a deleted
        // row never reappears and the cursor never re-visits its
        // position.
        PendingDeletion::query()
            ->where('scheduled_for', '<=', $now)
            ->with('user')
            ->chunkById(50, function ($chunk) use ($dryRun, &$purged, &$failed): void {
                foreach ($chunk as $pending) {
                    $userId = $pending->user_id;
                    // The FK is `cascadeOnDelete`, so `$pending->user` is
                    // typed non-null and an orphan row cannot exist via
                    // the normal lifecycle. Defensive null check still
                    // here in case raw SQL outside the framework hand-
                    // deletes a user row — we'd rather skip + log than
                    // tank the whole cohort. PHPStan thinks the eager-
                    // loaded relation is non-null; suppress because the
                    // runtime guarantee is weaker than the type hint.
                    $user = $pending->user;
                    /** @phpstan-ignore identical.alwaysFalse */
                    if ($user === null) {
                        $this->warn("orphan pending_deletion id={$pending->id} (user_id={$userId}) — skipping");

                        continue;
                    }

                    if ($dryRun) {
                        $this->line("would purge user #{$userId}");

                        continue;
                    }

                    try {
                        $this->purge->execute($user);
                        ++$purged;
                        $this->line("purged user #{$userId}");
                    } catch (\Throwable $e) {
                        ++$failed;
                        report($e); // Sentry / log channel will pick it up when configured.
                        $this->error("FAILED user #{$userId}: {$e->getMessage()}");
                    }
                }
            });

        $this->info("Done. Purged: {$purged}. Failed: {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
