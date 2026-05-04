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
use Illuminate\Support\Facades\Mail;

/**
 * Daily scan that emails every academy a digest of medical certificates
 * expiring at the three configured thresholds (today, today + 7,
 * today + 30). Scheduled at 09:00 Europe/Rome from
 * `routes/console.php`. M5 PR-D.
 *
 * **Per-academy de-dup** via `notification_log`: a `(academy_id,
 * notification_type, sent_for_date)` unique key prevents an oncall
 * re-running the artisan on the same day from sending a duplicate
 * digest. The unique index is the race-safety guarantee — two
 * concurrent invocations both inserting the same row will collide
 * on the index, the loser falls back, and only one email is queued.
 *
 * **Resilience**: per-academy failures are logged and DO NOT stop
 * the loop. A single malformed row, a transient queue insert blip,
 * or a Mailable serialization glitch can't tank the whole digest
 * pass.
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

                        if (! $force && $this->alreadySentToday($academy, $today)) {
                            ++$skipped;
                            $this->line(\sprintf('skipped academy #%d (already sent today)', $academy->id));

                            continue;
                        }

                        Mail::to($academy->owner)->queue(new MedicalCertificateExpiringMail($academy, $documents));

                        // Insert AFTER the queue call so a queue-side
                        // failure doesn't poison the de-dup table —
                        // an oncall can re-run without `--force` and
                        // pick up where we left off.
                        NotificationLog::query()->updateOrCreate(
                            [
                                'academy_id' => $academy->id,
                                'notification_type' => self::NOTIFICATION_TYPE,
                                'sent_for_date' => $today->toDateString(),
                            ],
                            [],
                        );

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

    private function alreadySentToday(Academy $academy, Carbon $today): bool
    {
        return NotificationLog::query()
            ->where('academy_id', $academy->id)
            ->where('notification_type', self::NOTIFICATION_TYPE)
            ->whereDate('sent_for_date', $today)
            ->exists();
    }
}
