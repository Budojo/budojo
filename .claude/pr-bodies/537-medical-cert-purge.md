## What

Daily cron `budojo:purge-expired-medical-certificates` deletes every medical certificate whose `expires_at` is older than 24 months. The DPIA-lite `R6` mitigation that was previously "pianificata" is now "implementata".

## Why

The DPIA-lite at `docs/legal/dpia-medical-certificates.md` § 4 + § 6 documents the 24-month retention window as the compromise between a CONI / FGI inspection's interest in audit history and GDPR Art. 5 §1 lett. (e) ("kept for no longer than necessary"). Until this PR there was no automatic cleanup — documents lived forever unless the owning athlete was removed. This closes that compliance gap.

## How

- New `App\Console\Commands\PurgeExpiredMedicalCertificates`:
  - Selects `Document::query()->where('type', medical_certificate)->where('expires_at', '<', now-24mo)->limit(500)->get()`.
  - Routes each row through `DeleteDocumentAction::execute()` — same code path the `AthleteObserver` cascade uses on athlete removal. File bytes on the `local` disk get unlinked AND the row gets soft-deleted in one shot.
  - Per-row try/catch + report() so a transient failure on one row doesn't block the rest of the cohort. Exit code is FAILURE when ≥ 1 row failed, so the scheduler alerts but partial progress stands.
- Scheduled daily at `03:15 Europe/Rome` (15 min after `purge-expired-login-attempts`, keeping the off-peak window single-threaded). `withoutOverlapping(60)` lock.
- 500 purges/run cap — medical certs are low-volume (≤ 1 per athlete per year typically), so daily cadence comfortably clears a several-thousand-academy backlog inside a week.
- `--dry-run` flag prints the candidate count without touching DB or disk.
- DPIA-lite § R6 mitigation row updated: previously "Mitigazione pianificata" → now flagged implementata.

## Notes

- **Scope discipline** — the query is keyed strictly on `type = medical_certificate`. Federation registrations, ID copies, and any future `DocumentType` case have their own retention rules that haven't been decided yet; the cron does not touch them. The test "does not touch non-medical documents" pins that contract.
- **Documents with NULL expires_at** are skipped. Legacy uploads from before a UI required the expiry field may carry NULL; the absence of a date is the absence of a retention signal, so they stay until an explicit retention rule lands.
- **PII discipline** — the command logs only the cutoff date + counts. Never the athlete name, document id, or file path.

## Out of scope (per the issue body)

- Notifying the academy before the purge — polite but not GDPR-required for a documented retention policy.
- Retention crons for other document types — separate tracking when their rules are decided.

## References

- Closes #537
- DPIA-lite § 4 (Retention) + § 6 R6 (Mitigations) in `docs/legal/dpia-medical-certificates.md`

## Test plan

- [x] `vendor/bin/pest tests/Feature/Document/PurgeExpiredMedicalCertificatesTest.php` — 5 specs green (9 assertions).
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [ ] Manual smoke on a seeded DB: confirm the `php artisan budojo:purge-expired-medical-certificates --dry-run` shape + a one-shot real run.
- [ ] Forge-side: confirm the daily 03:15 entry shows in `php artisan schedule:list` post-deploy.
