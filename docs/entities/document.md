# Entity — `Document`

## Purpose

A `Document` is a **file** attached to an `Athlete` — typically an ID card, a medical certificate, or an insurance paper — plus the metadata an academy owner needs to track its validity (issue date, expiry date, notes). Expiry tracking is the killer-use-case of M3; uploading and downloading files is the supporting infrastructure.

Documents are the first entity in the system that owns **physical files on disk**, not just rows in the DB. That has two consequences that propagate through the rest of this doc:

1. Every access to the file goes through the authenticated `GET /api/v1/documents/{id}/download` endpoint — files are NEVER served from the web root.
2. Deleting a `Document` soft-deletes the row AND removes the file from the disk. This is GDPR-friendly and matches the M3 PRD policy.

## Schema — `documents`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, **cascade on delete**, indexed | Tenant scoping via athlete → academy |
| `type` | string | not null | Cast to `App\Enums\DocumentType` backed enum (`id_card` / `medical_certificate` / `insurance` / `other`) |
| `file_path` | string | not null | Path on the `local` disk, relative to `storage/app/private/`. Server-generated, never client-supplied. |
| `original_name` | string | not null | The filename the client uploaded (e.g. `certificate_2026.pdf`). Surfaced in `Content-Disposition` on download. |
| `mime_type` | string | not null | MIME type at upload time. Used in the download `Content-Type` header. |
| `size_bytes` | unsignedBigInteger | not null | File size in bytes at upload time |
| `issued_at` | date | nullable | When the document was issued (e.g. medical cert signed by Dr. Rossi on 2026-01-15) |
| `expires_at` | date | nullable, **indexed** | When the document becomes invalid. Null is allowed. Indexed because it drives the `/documents/expiring` query |
| `notes` | text | nullable, max 500 chars | Free-text note (e.g. "Dr. Rossi clinic", "replaces 2025 cert") |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable, **SoftDeletes** | Soft-delete marker. When set, the physical file has been wiped from disk. |

## Relations

- `belongsTo(Athlete::class)` — inverse of `Athlete::documents()`

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(athlete_id)` — auto-created FK index, drives the per-athlete list query
- `INDEX(athlete_id, deleted_at)` — composite, covers both the FK scope and the soft-delete filter used everywhere
- `INDEX(expires_at)` — single column, required for the `/documents/expiring` date-range query to be performant

## Enums

### `App\Enums\DocumentType`

| Case | Value | Meaning |
|---|---|---|
| `IdCard` | `id_card` | Government-issued ID (passport, carta d'identità) |
| `MedicalCertificate` | `medical_certificate` | Medical fitness certificate — the one with the annual expiry |
| `Insurance` | `insurance` | Sport insurance policy |
| `Other` | `other` | Anything else worth tracking (waiver, minor consent, …) |

**No unique constraint** is enforced on `(athlete_id, type)`. An athlete has a **history** of certificates (one per year); the "current" medical certificate is the most recent non-soft-deleted row with `expires_at` in the future. The UI decides what to show — the schema preserves everything.

## Business rules

- **Academy scoping via the athlete.** A document belongs to an athlete, which belongs to an academy. Every controller action re-checks that `document->athlete->academy_id === auth()->user()->academy->id` before serving or mutating. This is a controller-level check, same pattern as `Athlete`.
- **File storage: `local` disk only.** Files live at `storage/app/private/documents/*`. No public symlink, no signed URL. The only way to retrieve a file is the authenticated `GET /api/v1/documents/{id}/download` endpoint.
- **File validation: `pdf` / `jpeg` / `png`, max 10 MB.** Validated server-side via Laravel's `mimetypes` rule — client-side validation is pre-flight UX only and is not trusted.
- **Soft-delete wipes the physical file.** `DELETE /api/v1/documents/{id}` calls `DeleteDocumentAction` which runs `Storage::disk('local')->delete($filePath)` before setting `deleted_at`. A missing file is tolerated (idempotency). There is no "restore" path — the row stays for audit, the file is gone.
- **Athlete soft-delete cascades.** When an `Athlete` is soft-deleted, `AthleteObserver::deleting` loops over `$athlete->documents` and calls `DeleteDocumentAction` on each. Every row is soft-deleted, every file is wiped. Consistent with the per-document GDPR policy.
- **File cannot be replaced via `PUT`.** `UpdateDocumentRequest` strips `file`, `file_path`, and `athlete_id` from the validated payload — only metadata (`type`, `issued_at`, `expires_at`, `notes`) is updateable. To replace a file, upload a brand new document row and soft-delete the old one.
- **Expiring query excludes `expires_at = null`.** A document without expiry isn't "expiring" — it's a no-expiry document. Those are handled by the UI badge logic, not the `/documents/expiring` endpoint.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/documents` — paginated list for a specific athlete (50/page, newest first, soft-deleted excluded)
- `POST /api/v1/athletes/{athlete}/documents` — multipart upload, nested under the athlete
- `GET /api/v1/documents/{id}/download` — authenticated file stream
- `PUT /api/v1/documents/{id}` — partial metadata update (no file replacement)
- `DELETE /api/v1/documents/{id}` — soft-delete + file wipe
- `GET /api/v1/documents/expiring?days=N` — cross-athlete list of documents with `expires_at` ≤ today + N (default 30), ordered ascending. Includes already-expired docs.

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)

## Future

- **M3.2 / M3.3 / M3.4** — Angular UI layers on top of this API (per-athlete list, upload dialog, dashboard expiring widget).
- **M5** — Email reminders before expiry. Reads `expires_at` via the same `GetExpiringDocumentsAction`. No schema change needed.
