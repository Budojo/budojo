<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Document\DeleteDocumentAction;
use App\Enums\DocumentType;
use App\Models\Document;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * GDPR retention enforcement for medical certificates (#537,
 * implements `docs/legal/dpia-medical-certificates.md` § R6).
 *
 * Selects every `documents` row where `type = medical_certificate`
 * AND `expires_at < now() - 24 months`, then routes each through
 * the canonical `DeleteDocumentAction` so the file bytes on the
 * `local` disk are unlinked AND the row is soft-deleted — same code
 * path the `AthleteObserver` cascade uses on athlete removal.
 *
 * **Why 24 months?** The compromise documented in the DPIA between
 * a CONI / FGI inspection's interest in audit history and GDPR
 * Art. 5 §1 lett. (e) ("kept for no longer than necessary"). 24 months
 * sits comfortably past any plausible inspection window while
 * minimising long-tail PII exposure.
 *
 * **Scope discipline.** ONLY medical certificates are touched —
 * federation registrations, ID copies, and any future `DocumentType`
 * case have their own retention rules that haven't been decided yet.
 * The query is keyed on `type = medical_certificate` to prevent
 * accidental fan-out if a future case lands without a retention policy.
 *
 * **Cap.** Hard-stops at 500 purges per run. Medical certs are
 * relatively low-volume (≤ 1 per athlete per year typically), so
 * 500/day clears a several-thousand-academy backlog inside a week.
 *
 * **PII discipline.** Logs only counts and the cutoff date — never
 * the athlete name, document id, or file path. The daily scheduler
 * stdout is the only audit trail; the soft-deleted row keeps the
 * compliance trail on the DB side.
 *
 * **Resilience.** A per-row failure (e.g. file already missing on
 * disk → swallowed by `DeleteDocumentAction`; or a transient DB
 * error → caught here) reports and continues to the next row. The
 * exit code reports FAILURE only when ≥ 1 row failed, so the
 * scheduler alerts but partial progress is preserved.
 */
class PurgeExpiredMedicalCertificates extends Command
{
    public const int RETENTION_MONTHS = 24;
    public const int DELETE_CAP = 500;

    protected $signature = 'budojo:purge-expired-medical-certificates {--dry-run : Print what would be purged without touching the DB or storage}';

    protected $description = 'Daily cleanup of medical certificates whose expires_at is older than 24 months (#537, DPIA § R6)';

    public function __construct(
        private readonly DeleteDocumentAction $deleteAction,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $cutoff = Carbon::now()->subMonths(self::RETENTION_MONTHS);
        $dryRun = (bool) $this->option('dry-run');

        /** @var \Illuminate\Database\Eloquent\Collection<int, Document> $rows */
        $rows = Document::query()
            ->where('type', DocumentType::MedicalCertificate->value)
            ->where('expires_at', '<', $cutoff)
            ->limit(self::DELETE_CAP)
            ->get();

        if ($rows->isEmpty()) {
            $this->info('No expired medical certificates to purge.');

            return self::SUCCESS;
        }

        $this->info(\sprintf(
            '%s: found %d medical certificate(s) with expires_at older than %s.',
            $dryRun ? 'DRY RUN' : 'Processing',
            $rows->count(),
            $cutoff->toDateString(),
        ));

        if ($dryRun) {
            return self::SUCCESS;
        }

        $purged = 0;
        $failed = 0;
        foreach ($rows as $doc) {
            try {
                $this->deleteAction->execute($doc);
                $purged++;
            } catch (\Throwable $e) {
                $failed++;
                report($e);
            }
        }

        $this->info("Done. Purged: {$purged}. Failed: {$failed}.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
