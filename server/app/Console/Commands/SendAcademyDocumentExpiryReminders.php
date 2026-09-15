<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Academy;
use App\Models\Document;
use App\Models\NotificationLog;
use App\Notifications\OwnerAcademyDocumentExpiringNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Daily scan for the academy's own papers running out (#1743) — the DAE
 * certificate, the liability policy, the affiliation, the lease.
 *
 * **A sibling of `SendMedicalCertExpiryReminders`, not a widening of it.** That
 * command is medical-only by name, by filter, by the mail template it renders
 * and by the notification preference that gates it. Teaching it a second
 * document type would have left a command whose name promises one thing and
 * whose behaviour is another — and would have put a liability policy behind an
 * opt-out checkbox labelled "medical certificate reminders".
 *
 * Everything else is deliberately the same shape, because the shape is right:
 * the same three thresholds, the same `notification_log` claim-before-send
 * de-dup, the same per-academy try/catch so one bad row cannot tank the pass,
 * and the same `--force` escape hatch.
 */
class SendAcademyDocumentExpiryReminders extends Command
{
    public const NOTIFICATION_TYPE = 'academy_document_expiry_digest';

    /** T-0, T-7, T-30 — the cadence the medical digest and the dashboard already use. */
    private const TRIGGER_OFFSETS = [0, 7, 30];

    protected $signature = 'budojo:send-academy-document-expiry-reminders'
        . ' {--force : Re-send digests for today even if notification_log already records them}';

    protected $description = "Daily digest: the academy's own documents expiring at T-30, T-7 or T-0 (#1743)";

    public function handle(): int
    {
        $today = Carbon::today();
        $triggerDates = array_map(
            fn (int $offset): string => $today->copy()->addDays($offset)->toDateString(),
            self::TRIGGER_OFFSETS,
        );

        $sent = 0;
        $skipped = 0;
        $failed = 0;
        $force = (bool) $this->option('force');

        Academy::query()
            ->with('owner')
            ->chunkById(50, function ($chunk) use ($triggerDates, $today, $force, &$sent, &$skipped, &$failed): void {
                foreach ($chunk as $academy) {
                    try {
                        $documents = $this->expiringPapersFor($academy, $triggerDates);
                        if ($documents->isEmpty()) {
                            continue;
                        }

                        // Per-user opt-out, the same gate every other
                        // owner-facing reminder carries. Skipped WITHOUT
                        // claiming a `notification_log` row, so re-ticking the
                        // box takes effect on the next trigger rather than
                        // after a day of silence.
                        $owner = $academy->owner;
                        if ($owner === null || ! NotificationPreferences::isEnabled(
                            $owner,
                            NotificationCategory::ACADEMY_DOCUMENT_EXPIRY_REMINDERS,
                        )) {
                            $skipped++;

                            continue;
                        }

                        if ($force) {
                            NotificationLog::query()
                                ->where('academy_id', $academy->id)
                                ->where('notification_type', self::NOTIFICATION_TYPE)
                                ->whereDate('sent_for_date', $today)
                                ->delete();
                        }

                        // Claim before send, inside a transaction, exactly as
                        // the medical digest does: the unique index on
                        // (academy_id, notification_type, sent_for_date) makes
                        // the loser of any concurrent run a silent no-op, and a
                        // failure on the send rolls the claim back so tomorrow
                        // picks the academy up again.
                        $queued = DB::transaction(function () use ($academy, $documents, $today, $owner): bool {
                            try {
                                NotificationLog::query()->create([
                                    'academy_id' => $academy->id,
                                    'notification_type' => self::NOTIFICATION_TYPE,
                                    'sent_for_date' => $today,
                                ]);
                            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                                return false;
                            }

                            $owner->notify(new OwnerAcademyDocumentExpiringNotification($academy, $documents));

                            return true;
                        });

                        if (! $queued) {
                            ++$skipped;

                            continue;
                        }

                        ++$sent;
                        $this->line(\sprintf(
                            'queued academy-document digest for academy #%d (%d document%s)',
                            $academy->id,
                            $documents->count(),
                            $documents->count() === 1 ? '' : 's',
                        ));
                    } catch (\Throwable $e) {
                        ++$failed;
                        report($e);
                        $this->error(\sprintf('FAILED academy #%d: %s', $academy->id, $e->getMessage()));
                    }
                }
            });

        $this->info(\sprintf('Done. Sent: %d. Skipped: %d. Failed: %d.', $sent, $skipped, $failed));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  list<string>  $triggerDates
     * @return \Illuminate\Database\Eloquent\Collection<int, Document>
     */
    private function expiringPapersFor(Academy $academy, array $triggerDates): \Illuminate\Database\Eloquent\Collection
    {
        // `academy->documents()` is the academy's OWN papers — rows with a
        // null `athlete_id`. An athlete's medical certificate reaches the
        // owner through the other command, and a document must not produce
        // two reminders for one expiry.
        return $academy->documents()
            ->whereNotNull('expires_at')
            ->where(function ($q) use ($triggerDates): void {
                foreach ($triggerDates as $date) {
                    $q->orWhereDate('expires_at', $date);
                }
            })
            ->orderBy('expires_at', 'asc')
            ->get();
    }
}
