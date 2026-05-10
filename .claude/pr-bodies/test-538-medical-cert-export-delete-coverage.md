## What

Closes #538. Pins the medical-certificate handling in the two GDPR-sensitive flows:

- `GET /me/export` (Art. 15 access + Art. 20 portability) — the export ZIP must contain the medical-cert binary AND the `type=medical_certificate` JSON metadata, not just one of the two.
- `PurgeAccountAction` (Art. 17 erasure) — when the user's 30-day grace window expires, the medical-cert binary on disk MUST be deleted, not just the DB row.

Both flows already do the right thing today (verified by reading the code). What was missing was **explicit assertions** so a future refactor can't silently regress the special-category-data handling — only generic-document coverage existed.

## Why

The DPIA-lite (`docs/legal/dpia-medical-certificates.md`, shipped in #533) flagged R7 — "Subject access request non onorabile (no esportazione, no cancellazione)" — as a real risk needing a verification pass. The mitigation row pointed at this work as `follow-up #227-b`. The DPIA's § 8.2 also notes that the action items per the chosen A/B option both require this verification.

Today the export Action serializes documents with `type` in the JSON envelope, and the export controller's ZIP variant streams the file binary into `documents/athlete-{id}/{id}-{filename}`. The `PurgeAccountAction` collects disk paths BEFORE the user-delete cascade and walks soft-deleted athletes via `withTrashed()` so even kids removed from the roster pre-account-deletion get their certs scrubbed.

All correct. None of it was specifically tested on a `DocumentType::MedicalCertificate` document — the existing tests use generic factory documents. Without medical-cert-shaped tests, a refactor that, say, narrowed the `withTrashed()` walk or changed the ZIP entry layout would not be caught.

## How

Four new tests added, all explicitly typed `DocumentType::MedicalCertificate` so the assertion intent is unambiguous in the diff. Two per file; each block carries a short comment header explaining the GDPR article + DPIA link.

### `tests/Feature/User/ExportUserDataTest.php` — Art. 15 / Art. 20

1. **`export ZIP includes the medical-certificate binary AND the type=medical_certificate metadata`** — the high-bar test:
   - JSON entry: `type` field equals the enum string value `medical_certificate`.
   - Canonical ZIP entry path `documents/athlete-{id}/{id}-{filename}` exists in the archive.
   - The ZIP-extracted bytes equal the bytes stored on disk (`Storage::disk('local')->get($storedPath)`). This is the strict assertion — not a stub, not a metadata placeholder. Without it the right of access could degrade to "metadata only".

2. **`export ZIP keeps medical-cert metadata even when the binary is missing on disk`** — covers the corrupt-backup / lost-file scenario. The DB row exists; the file doesn't. The export must still surface the JSON entry, otherwise a record could silently disappear from the data subject's view of their own data. Existing controller code uses `Storage::disk('local')->exists($storagePath); continue;` — this test pins that behaviour.

### `tests/Feature/User/AccountDeletionTest.php` — Art. 17

1. **`PurgeAccountAction wipes medical certificates (Art. 9 + Art. 17)`** — the basic case. After the action runs:
   - `Document::withTrashed()->where('id', $doc->id)->count()` is 0 (cascade-driven row delete).
   - `Storage::disk('local')->exists($stored)` is `false` (the new piece — without this, a refactor that stops touching the disk would still pass on the row-only assertion).

2. **`PurgeAccountAction wipes medical certificates of soft-deleted athletes too`** — pins the `withTrashed()` walk. Athlete soft-deleted BEFORE the user requested account deletion; their medical cert still has to go. Without this test, a refactor narrowing the walk to `whereNull('deleted_at')` would leave orphan PDFs on disk.

## Notes

- **No production code changed.** The existing `ExportController::buildZipResponse` and `PurgeAccountAction::collectDiskPaths` already handle the medical-cert path correctly; this PR is testing-only.
- **PHPStan scope.** PHPStan analyses `app/` only (per `server/phpstan.neon` `paths:`). The new test code uses the same `$upload->store()` string|false return-type pattern as the existing tests in the same files; the gate is unaffected.
- **Local parallel-test flakiness.** Running `vendor/bin/pest --parallel` against the local Docker SQLite returns 500 failures both with AND without my changes (verified via `git stash`) due to a pre-existing memory/concurrency issue in the local container. Each new test passes when run individually (`pest tests/Feature/User/ExportUserDataTest.php --filter='medical'` → 10 assertions, `pest tests/Feature/User/AccountDeletionTest.php --filter='medical'` → 4 assertions). CI runs in a fresh container and is the source of truth — flagging this here so a reviewer doesn't think the local flake reflects on this PR.
- **DocumentType enum.** Used `DocumentType::MedicalCertificate->value` (i.e. the string `medical_certificate`) for the JSON-side assertion, and the enum case directly for the factory `'type' => DocumentType::MedicalCertificate` so the assertion intent reads off the import.

## Test plan

- [x] `pest tests/Feature/User/ExportUserDataTest.php --filter='medical'` — 10 assertions pass.
- [x] `pest tests/Feature/User/AccountDeletionTest.php --filter='medical'` — 4 assertions pass.
- [x] No production code changed; existing tests in both files still run alongside the new ones (factory + filesystem fakes are scoped per-test via `Storage::fake('local')`).
- [x] PHPStan: `app/` is in scope, tests are not — gate unaffected.
- [x] PHP CS Fixer: new lines follow the style of the surrounding tests (declare strict, snake_case `it()` blocks, English-first inline comments).
- [ ] CI green on this PR (PHPStan + PEST + Vitest + Cypress + OpenAPI lint). The local parallel-test flake is a Docker-environment artefact, NOT a regression — same 500 failures occur on develop without these changes.
