## What

Medical certificates uploaded by academy owners are now encrypted at-rest with AES-256-GCM. New uploads are encrypted in memory before landing on disk — no plaintext file ever persists. Downloads decrypt in memory and stream the bytes out with the HTTP response.

## Why

Medical certificates are **special-category data** under GDPR Art. 9 (data concerning health). The regulation requires additional technical safeguards; encryption at rest is the bare minimum. Today the bytes live as plain PDF/JPEG on `storage/app/private/documents/` — anyone with server access (admin, attacker, leaked backup) can read them. This PR closes that gap.

The DPIA-lite at `docs/legal/dpia-medical-certificates.md` § R4 documents encryption-at-rest as a planned mitigation; this implements it.

## How

**Server (Laravel 13)**

- Migration adds an `is_encrypted` boolean to `documents` (default `false`; legacy rows stay plaintext and remain readable indefinitely).
- `App\Support\DocumentEncryption` — AES-256-GCM with a wire format `[1 byte version=0x01][12 bytes IV][16 bytes GCM tag][N bytes ciphertext]`. Version byte lets a future key-rotation / algorithm swap land without ambiguity. Tag-mismatch and unknown-version both throw, keeping the deserialise path strict.
- `UploadDocumentAction`: when `type === MedicalCertificate` AND `DOCUMENT_ENCRYPTION_KEY` is set, encrypt the bytes in memory then write the ciphertext directly. Other document types (federation registrations, IDs) stay plaintext — they're not Art. 9 data and don't need this protection.
- `DocumentController::download` branches on `is_encrypted`: encrypted rows decrypt in memory and return a non-streamed response with the right `Content-Type`; plaintext rows keep the previous `Storage::download` path so legacy uploads still serve correctly.
- `config/documents.php` centralises the key resolution from `DOCUMENT_ENCRYPTION_KEY`. The key is SEPARATE from `APP_KEY` so it can be rotated independently of every other Laravel-encrypted column.
- `phpunit.xml` provisions a deterministic test key so PEST exercises the encryption path without per-test setup.

**Tests (7 PEST specs)**:

- Bytes-not-plaintext-on-disk: assert the stored file does NOT contain the original plaintext + starts with the version byte 0x01.
- Round-trip via the HTTP download endpoint returns the original plaintext.
- Non-medical document types stay plaintext (no Art. 9 implications).
- Legacy `is_encrypted = false` rows still download correctly.
- DocumentEncryption round-trip including random binary + null bytes.
- Tampered blob rejection (GCM auth tag mismatch throws).
- Unknown version byte rejection.

**Docs**

- `docs/entities/document.md` — new `is_encrypted` row.
- `docs/infra/production-deployment.md` — new "Document encryption key rotation" runbook (generate, swap, re-encrypt, backup, warning about irreversible loss).
- `.env.example` — `DOCUMENT_ENCRYPTION_KEY` with a generation one-liner + "NEVER leave blank in production" warning.

## Notes

- **Backwards compat** — every pre-#224 row stays plaintext (`is_encrypted = false`). The download path serves them as-is. A future re-encryption batch can flip them en masse; not in this PR's scope.
- **Scope** — only `medical_certificate` uploads are encrypted today. Other types don't carry Art. 9 implications. The column name is generic (`is_encrypted`, not `is_medical_encrypted`) so a future decision to extend doesn't require a rename.
- **No plaintext on disk** — the upload path encrypts in memory and writes ciphertext directly, avoiding the "wrote plaintext, then re-wrote ciphertext" race that violates the issue's strict reading.
- **Key rotation** — the runbook documents the procedure but the re-encryption artisan command is intentionally deferred until rotation is actually needed. Until then, key rotation requires a backup-restore plan, not a hot swap.

## Out of scope

- Re-encryption artisan command for legacy rows (separate issue when rotation is needed).
- KMS / Cloudflare Secret Store migration of the key (env-based is fine for current scale).
- Encryption of non-medical document types (federation registrations, IDs — different legal basis, can be added later if classification changes).

## References

- Closes #224
- DPIA-lite § R4 — `docs/legal/dpia-medical-certificates.md`

## Test plan

- [x] `vendor/bin/pest tests/Feature/Document` — 61 specs pass (152 assertions), includes 7 new encryption specs.
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [ ] Forge-side: set `DOCUMENT_ENCRYPTION_KEY` before merging to main (production deploy will fail to encrypt uploads otherwise — `is_encrypted` will stay `false` and new uploads will write plaintext, which is the safe default but defeats the purpose).
- [ ] Manual smoke: upload a medical cert via the dashboard, inspect `storage/app/private/documents/*.enc` confirms binary garbage, download confirms original plaintext returned.
