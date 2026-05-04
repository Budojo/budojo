<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\DocumentType;
use App\Mail\MedicalCertificateExpiringMail;
use App\Models\Academy;
use App\Models\Document;
use App\Models\NotificationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Daily scan that emails every academy a digest of medical certificates
 * expiring at the three configured thresholds (today, today + 7,
 * today + 30). Scheduled at 09:00 Europe/Rome from
 * `routes/console.php`. M5 PR-D.
 *
 * **Per-academy de-dup** via `notification_log`: a `(academy_id,
 * notification_type, sent_for_date)` unique key. The race-safety
 * comes from "claim before send" — we INSERT the log row FIRST, and
 * only queue the digest if the insert won the race. The unique
 * index makes the loser of any concurrent insert silently no-op
 * (insertOrIgnore returns 0). The whole claim-then-queue is wrapped
 * in DB::transaction so a queue-side failure rolls back the claim
 * and tomorrow's run picks up the still-unsent academy. Without
 * this ordering — and the original draft of this command had it
 * inverted — two concurrent invocations could both pass the
 * "already sent today?" check and both queue a digest before
 * either wrote the log row. Copilot caught the regression on PR-D.
 *
 * **Resilience**: per-academy failures are logged and DO NOT stop
 * the loop. A single malformed row, a transient queue insert blip,
 * or a Mailable serialization glitch can't tank the whole digest
 * pass — the transaction rolls back THAT academy's claim and the
 * loop moves on.
 *
 * **Idempotency** — `--force` overrides the de-dup row for an
 * exceptional re-send (e.g. the queue was misconfigured during the
 * 09:00 run, the oncall fixes it and wants to retry). Default is
 * de-dup-protected.
 */
class SendMedicalCertExpiryReminders extends Command
{
    public const NOTIFICATION_TYPE = 'medical_cert_expiry_digest';

    /**
     * Threshold offsets (in days) at which we surface a cert as
     * "expiring". Today (T-0) is the day the cert lapses; T+7 is
     * one-week notice; T+30 is one-month notice — matches the
     * existing M3 dashboard widget cadence.
     */
    private const TRIGGER_OFFSETS = [0, 7, 30];

    protected $signature = 'budojo:send-medical-cert-expiry-reminders'
        . ' {--force : Re-send digests for today even if notification_log already records them}';

    protected $description = 'Daily digest: medical certificates expiring at T-30, T-7, or T-0 per academy (M5 PR-D)';

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
                        $documents = $this->expiringMedicalCertsFor($academy, $triggerDates);

                        if ($documents->isEmpty()) {
                            continue;
                        }

                        // --force bypass: clear today's claim row so the
                        // claim-then-queue cycle below succeeds. Done in
                        // its own statement so a malformed --force run
                        // can be diagnosed via the deletion's row count.
                        if ($force) {
                            NotificationLog::query()
                                ->where('academy_id', $academy->id)
                                ->where('notification_type', self::NOTIFICATION_TYPE)
                                ->whereDate('sent_for_date', $today)
                                ->delete();
                        }

                        // Race-safe send: claim the log row FIRST, then
                        // queue. insertOrIgnore relies on the unique
                        // index — a concurrent invocation that lost the
                        // race gets `inserted = 0` and we skip without
                        // queueing. The whole pair runs inside a
                        // transaction so a queue-side failure rolls back
                        // the claim and tomorrow's run picks up the
                        // still-unsent academy.
                        $queued = DB::transaction(function () use ($academy, $documents, $today): bool {
                            // Use Eloquent's create() so the date cast on
                            // sent_for_date applies consistently — the
                            // unique index on (academy_id,
                            // notification_type, sent_for_date) only
                            // fires when both inserts use the same
                            // string representation. A raw insertOrIgnore
                            // bypasses the cast and writes a bare
                            // 'YYYY-MM-DD' while Eloquent writes
                            // 'YYYY-MM-DD 00:00:00' — different strings,
                            // unique constraint silently lets both
                            // through. Catching the
                            // UniqueConstraintViolationException is
                            // the race-safe outcome regardless.
                            try {
                                NotificationLog::query()->create([
                                    'academy_id' => $academy->id,
                                    'notification_type' => self::NOTIFICATION_TYPE,
                                    'sent_for_date' => $today,
                                ]);
                            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                                return false;
                            }

                            Mail::to($academy->owner)->queue(new MedicalCertificateExpiringMail($academy, $documents));

                            return true;
                        });

                        if (! $queued) {
                            ++$skipped;
                            $this->line(\sprintf('skipped academy #%d (already sent today)', $academy->id));

                            continue;
                        }

                        ++$sent;
                        $this->line(\sprintf(
                            'queued digest for academy #%d (%d cert%s)',
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

        $this->info(\sprintf(
            'Done. Sent: %d. Skipped (already sent today): %d. Failed: %d.',
            $sent,
            $skipped,
            $failed,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  list<string>  $triggerDates  ISO YYYY-MM-DD strings for the
     *                                      three trigger thresholds.
     * @return \Illuminate\Database\Eloquent\Collection<int, Document>
     */
    private function expiringMedicalCertsFor(Academy $academy, array $triggerDates): \Illuminate\Database\Eloquent\Collection
    {
        // The `expires_at` column is `date`; on SQLite (the test
        // driver) a `WHERE expires_at IN (?, ?, ?)` against ISO date
        // strings is unreliable when the model's cast normalises the
        // stored representation. Use OR-orWhereDate so the database
        // does the comparison against the date portion explicitly,
        // matching regardless of any datetime-vs-date subtlety in
        // the storage round-trip.
        return Document::query()
            ->whereHas('athlete', fn ($q) => $q->where('academy_id', $academy->id))
            ->where('type', DocumentType::MedicalCertificate)
            ->where(function ($q) use ($triggerDates): void {
                foreach ($triggerDates as $date) {
                    $q->orWhereDate('expires_at', $date);
                }
            })
            ->with('athlete')
            ->orderBy('expires_at', 'asc')
            ->get();
    }
}
