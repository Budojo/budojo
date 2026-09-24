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
| `athlete_id` | bigint unsigned | **nullable**, FK `athletes.id`, cascade on delete, indexed | The person this document belongs to. Null when it belongs to the academy itself (#1743) |
| `academy_id` | bigint unsigned | nullable, FK `academies.id`, **cascade on delete**, indexed | The academy this document belongs to directly (#1743) — the DAE certificate, the liability policy, the affiliation, the lease. Null when it belongs to a person |
| `type` | string | not null | Cast to `App\Enums\DocumentType` backed enum (`id_card` / `medical_certificate` / `insurance` / `other`) |
| `file_path` | string | not null | Path on the `local` disk, relative to `storage/app/private/`. Server-generated, never client-supplied. |
| `original_name` | string | not null | The filename the client uploaded (e.g. `certificate_2026.pdf`). Surfaced in `Content-Disposition` on download. |
| `mime_type` | string | not null | MIME type at upload time. Used in the download `Content-Type` header. |
| `size_bytes` | unsignedBigInteger | not null | File size in bytes at upload time |
| `is_encrypted` | boolean | not null, default false | At-rest encryption flag (#224). True ⇒ the bytes on disk are AES-256-GCM ciphertext via `App\Support\DocumentEncryption`; false ⇒ plaintext (legacy uploads or non-medical types). Today only `type = medical_certificate` uploads set this to true — special-category data under GDPR Art. 9. |
| `issued_at` | date | nullable | When the document was issued (e.g. medical cert signed by Dr. Rossi on 2026-01-15) |
| `expires_at` | date | nullable, **indexed** | When the document becomes invalid. Null is allowed. Indexed because it drives the `/documents/expiring` query |
| `notes` | text | nullable, max 500 chars | Free-text note (e.g. "Dr. Rossi clinic", "replaces 2025 cert") |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable, **SoftDeletes** | Soft-delete marker. When set, the physical file has been wiped from disk. |

## Relations

- `belongsTo(Athlete::class)` — inverse of `Athlete::documents()`. Null on an academy document.
- `belongsTo(Academy::class)` — inverse of `Academy::documents()` (#1743). Null on an athlete document.

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(athlete_id)` — auto-created FK index, drives the per-athlete list query
- `INDEX(athlete_id, deleted_at)` — composite, covers both the FK scope and the soft-delete filter used everywhere
- `INDEX(academy_id, deleted_at)` — composite, the academy-document mirror of the athlete one (#1743)
- `INDEX(expires_at)` — single column, required for the `/documents/expiring` date-range query to be performant

## Enums

### `App\Enums\DocumentType`

| Case | Value | Meaning |
|---|---|---|
| `IdCard` | `id_card` | Government-issued ID (passport, carta d'identità) |
| `MedicalCertificate` | `medical_certificate` | Medical fitness certificate — the one with the annual expiry |
| `Insurance` | `insurance` | Sport insurance policy |
| `Other` | `other` | Anything else worth tracking (waiver, minor consent, …) |

**No unique constraint** is enforced on `(athlete_id, type)`. An athlete has a **history** of certificates (one per year); which one is "current" is a rule, below (§ Business rules, "An athlete's certificate status"). The schema preserves everything.

## Business rules

- **An athlete's certificate status is one rule (#1732).** Their **current certificate** is their live (`deleted_at is null`) `medical_certificate` row with the greatest `expires_at`, nulls last — the same "latest expiry wins" rule as `Document::scopeNotSuperseded` (#1739). `ResolveCertificateStatusAction` turns it into `valid` / `expiring` / `expired` / `missing` (`App\Enums\CertificateStatus`): no dated certificate at all is `missing`; before today is `expired`; today through today + 30 is `expiring`; later is `valid`. Whole calendar days, the same boundaries as the client's `classifyExpiry`, and `EXPIRY_WARNING_DAYS` is the same 30 on both sides. The SQL half is `Athlete::scopeWithCurrentCertificateExpiry` (a correlated `max(expires_at)`), so a reader counting a roster makes one query. `GET /stats/documents/compliance` counts active athletes by it (`CertificateComplianceAction`). The old wording here — "the most recent row with `expires_at` in the future" — had no answer when every row had expired, which is the case that matters.
- **Academy scoping via the athlete.** A document belongs to an athlete, which belongs to an academy. Every controller action re-checks that `document->athlete->academy_id === auth()->user()->academy->id` before serving or mutating. This is a controller-level check, same pattern as `Athlete`.
- **File storage: `local` disk only.** Files live at `storage/app/private/documents/*`. No public symlink, no signed URL. The only way to retrieve a file is the authenticated `GET /api/v1/documents/{id}/download` endpoint.
- **File validation: `pdf` / `jpeg` / `png`, max 10 MB.** Validated server-side via Laravel's `mimetypes` rule — client-side validation is pre-flight UX only and is not trusted.
- **Soft-delete wipes the physical file.** `DELETE /api/v1/documents/{id}` calls `DeleteDocumentAction` which runs `Storage::disk('local')->delete($filePath)` before setting `deleted_at`. A missing file is tolerated (idempotency). There is no "restore" path — the row stays for audit, the file is gone.
- **Tombstone visibility** (PRD P0.7b). Soft-deleted rows are NOT returned by the per-athlete list endpoint by default. Passing `?trashed=1` includes them with `deleted_at` populated; the UI renders them as tombstones behind a "Show cancelled" toggle. The `DocumentResource` always emits `deleted_at` (null on active rows, ISO-8601 timestamp on tombstones).
- **Download of a tombstone returns 410 Gone.** `GET /api/v1/documents/{id}/download` is wired with `withTrashed()` route-model binding so it can see soft-deleted rows. The controller returns 410 (not 404) when `deleted_at` is set — semantically "the resource once existed, it's permanently gone." Ordering of checks: 403 (cross-academy) first, then 410 (tombstone), then 404 (missing file on an active row).
- **Athlete soft-delete cascades.** When an `Athlete` is soft-deleted, `AthleteObserver::deleting` loops over `$athlete->documents` and calls `DeleteDocumentAction` on each. Every row is soft-deleted, every file is wiped. Consistent with the per-document GDPR policy.
- **File cannot be replaced via `PUT`.** `UpdateDocumentRequest` strips `file`, `file_path`, and `athlete_id` from the validated payload — only metadata (`type`, `issued_at`, `expires_at`, `notes`) is updateable. To replace a file, upload a brand new document row and soft-delete the old one.
- **Expiring query excludes `expires_at = null`.** A document without expiry isn't "expiring" — it's a no-expiry document. Those are handled by the UI badge logic, not the `/documents/expiring` endpoint.
- **A document belongs to an athlete OR to the academy, never both and never neither** (#1743). Exactly one of `athlete_id` / `academy_id` is set. The invariant is enforced in `UploadDocumentAction` — the owner is the relation the row is created through, so neither path names a column — and **not** by a SQLite `CHECK`: the app must refuse the row before the database has to, and the same code has to hold on any driver.
  - **`Document::owningAcademyId()` is the tenant-scoping answer, in one place.** Five call sites used to reach through `$document->athlete->academy_id`; three of them null-pointer on an academy document, and five copies of a scoping rule is how a document from another install becomes downloadable. It returns null for an unattached row, which never equals an academy id, so an impossible row is refused rather than leaked.
  - **An academy document is never a medical certificate.** `UploadAcademyDocumentRequest` refuses the type: it is the one type that is special-category data under GDPR Art. 9 and the one type `UploadDocumentAction` encrypts, and an academy does not have a medical fitness certificate — a person does. Academy documents are therefore never encrypted, so their bytes are not behind the key in `secrets.bin`, which backups deliberately do not carry.
  - **`academy_id` cascades** like `athlete_id`: deleting an academy takes its papers with it.
  - **The expiring list merges both**, from two queries, re-sorted on `expires_at` then `id`. The 200-row cap applies to the **merged** list, not to each half — two capped queries return 400 rows, and capping each at 100 would hide urgent athlete certificates behind an academy's paperwork. The active-athlete scope (#1740) lives on the athlete join and does not apply to academy papers: a liability policy has no training status.
  - **Reminders are a separate command.** `budojo:send-academy-document-expiry-reminders` fires at the same T-30 / T-7 / T-0 thresholds with the same `notification_log` de-dup, and writes `kind: academy_document_expiry_reminders`. `SendMedicalCertExpiryReminders` was deliberately **not** widened: it is medical-only by name, by filter, by mail template and by the notification preference that gates it, and a liability policy behind a checkbox labelled "medical certificate reminders" is an opt-out nobody can find.
- **A renewed medical certificate supersedes the one it replaces** (#1739). A live medical-certificate row is **superseded** when the same athlete has another live medical-certificate row with a strictly greater `expires_at` — or an equal `expires_at` and a greater `id`, so a duplicate upload of the same date retires exactly one way round and the athlete never disappears from both sides of the tie. Superseded rows are excluded from `GET /documents/expiring` (and therefore from the roster alert count) and from the T-30 / T-7 / T-0 reminder pass — which is both the owner digest **and** the `AthleteMedicalCertExpiringNotification` push the same pass sends to the athlete, since both read the one filtered collection. The rule lives in one place, `Document::scopeNotSuperseded`.
  - **Medical certificates only.** `id_card`, `insurance` and `other` are never superseded: only a medical certificate has a renewal cycle the product models. Two ID cards are two documents, not a replacement.
  - **Undated rows sit outside the rule.** A medical row with `expires_at = null` neither supersedes nor is superseded — it carries no statement about when coverage ends, so it is no evidence coverage was renewed.
  - **Live means `deleted_at is null`.** A trashed certificate supersedes nothing, including one taken by `PurgeExpiredMedicalCertificates` after 24 months.
  - The athlete's own documents tab is **unaffected** — it lists history, and the superseded certificate stays visible there with its expiry badge.
- **The expiring query covers active athletes only** (#1740). `GET /documents/expiring` returns documents belonging to athletes with `status = active`, the same scope `missing_medical_certificate` has always used — one envelope cannot hold two definitions of who counts. An inactive athlete is not asked for a certificate, so their lapsed paperwork is not an alarm; it stays on their own documents tab. The T-30 / T-7 / T-0 reminder pass carries the same scope, because its notification links to that list — reminding about an athlete the list no longer shows would send the owner to a page reading "All documents up to date" about the very row the email named.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/documents` — paginated list for a specific athlete (50/page, newest first, soft-deleted excluded)
- `GET /api/v1/academy/documents` — the academy's own papers (#1743), same shape, no route parameter: the subject is the caller's active academy
- `POST /api/v1/academy/documents` — multipart upload of one of the academy's own papers; `medical_certificate` is refused
- `POST /api/v1/athletes/{athlete}/documents` — multipart upload, nested under the athlete
- `GET /api/v1/documents/{id}/download` — authenticated file stream
- `PUT /api/v1/documents/{id}` — partial metadata update (no file replacement)
- `DELETE /api/v1/documents/{id}` — soft-delete + file wipe
- `GET /api/v1/documents/expiring?days=N` — cross-athlete list of documents with `expires_at` ≤ today + N (default 30), ordered ascending. Includes already-expired docs.

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)

## Related UI

- **Per-athlete list** — `/dashboard/athletes/:id/documents` (`DocumentsListComponent`)
- **Upload dialog** — `UploadDocumentDialogComponent` mounted inside the per-athlete list; reactive form + multipart POST
- **Dashboard widget** — `ExpiringDocumentsWidgetComponent` rendered on `/dashboard/athletes`, shows count and deep-links to the full list
- **Cross-athlete expiring list** — `/dashboard/documents/expiring` (`ExpiringDocumentsListComponent`)

## Future

- **M5** — Email reminders before expiry. Reads `expires_at` via the same `GetExpiringDocumentsAction`. No schema change needed.
