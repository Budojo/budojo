# M3 — Documents & Deadlines (PRD)

> Status: Draft · Owner: m-bonanno · Target release: M3 (4 phased PRs)
> Supersedes the M3 one-liner on the README roadmap.

## Problem Statement

BJJ instructors today track each athlete's identity document and medical certificate on spreadsheets or, worse, on paper stuck behind the counter. The medical certificate is the one that really hurts — it expires annually, and letting a student train on an expired certificate is a legal and insurance risk for the academy owner. Spotting the expiring ones in a 150-row Excel sheet is a manual, error-prone chore that is frequently skipped until the insurer asks.

Replacing that chore with a purpose-built tool is the single most compelling reason an instructor would pay for Budojo over the current Excel status quo.

## Goals

1. **Eliminate the manual expiry audit.** An owner opening the app must be able to tell, in under 10 seconds, which athletes have an expiring or missing medical certificate.
2. **Make the first upload trivial.** A first-time user reaching an athlete's detail page should upload their first document in under 2 minutes, without reading docs.
3. **Prevent loss of regulatory evidence.** Every uploaded document is preserved for as long as the academy keeps the athlete. Expired documents are kept, not deleted, so compliance history is auditable.
4. **Set the foundation for email reminders (M5).** The data model and visual states shipped in M3 must directly feed the M5 notification layer without schema changes.
5. **Keep files private.** No uploaded document is reachable without an authenticated request that re-checks the requesting user owns the athlete's academy.

## Non-Goals

- **Email, SMS, or push notifications before expiry.** M3 ships only visual state (badges, dashboard widget). Automated reminders are **M5** — keeping them separate keeps M3 shippable in a reasonable window and lets us ship a working tool before committing to a mail transport.
- **A document portal for athletes.** Athletes do not have a login in M3. Only academy owners / instructors upload and view documents. A self-service athlete portal is **M6+**.
- **OCR, auto-extraction of expiry dates from the uploaded file.** Users type the dates manually. Auto-extraction is a ML-grade problem that would blow the M3 scope.
- **Document templates or e-signature flows.** Budojo is a tracker, not a signing service. DocuSign / Legally handle that.
- **Bulk upload of historic documents.** The initial roster will be typed in one document at a time. Bulk import is **M4+** once the single-doc UX is validated.
- **Thumbnail / preview generation server-side.** We store and serve the raw file. A browser can open PDFs and images natively.

## User Stories

Ordered by priority. Primary persona is the academy owner / instructor.

### Academy owner — primary flows

1. **Upload a new medical certificate.** As an academy owner, I want to upload a PDF or photo of an athlete's medical certificate with its expiry date, so that I no longer have to track that date in a spreadsheet.
2. **See at-a-glance which athletes are at risk.** As an academy owner, I want the dashboard to tell me how many documents are expiring in the next 30 days, so that I can chase those athletes before they become unable to train.
3. **Replace an expiring document.** As an academy owner, I want to upload the new year's medical certificate alongside the old one — not overwrite it — so that I have a history of what was valid and when.
4. **See per-athlete document status.** As an academy owner, looking at a specific athlete, I want to see each document's expiry state (valid, expiring soon, expired) as a colored badge, so that I do not need to read dates.
5. **Download a document to show a third party.** As an academy owner, I want to download a previously uploaded document (e.g., to forward it to our insurance broker), so that the upload is not a one-way write.
6. **Remove a wrong upload.** As an academy owner, if I uploaded the wrong file, I want to delete that document so it disappears from the athlete's record and from disk.

### Academy owner — edge and error states

7. **Reject oversized or wrong-type files.** As an academy owner, if I try to upload a 200 MB zip file, I want an immediate error (without waiting for the upload to finish) so I know what to fix.
8. **Recover from a failed upload.** As an academy owner, if the upload fails partway, I want the app to tell me and let me retry without losing the metadata (type, dates, notes) I already typed.

### Academy owner — foreshadowing M5

9. **(Future — M5) Get emailed about expiring documents.** Flagged here only so the M3 data model guarantees we can compute this later without migrations.

## Requirements

### Must-Have (P0)

All P0 items are mandatory for M3 to be called "shipped".

#### P0.1 — Document data model

A `documents` table and Eloquent model exist with the shape below. `Indexes` are mandatory for the P0.5 "expiring" query to be performant.

```
documents
├── id                  pk, bigint
├── athlete_id          fk athletes.id, cascade on delete, index
├── type                backed enum: id_card | medical_certificate | insurance | other
├── file_path           string — relative to disk `local`
├── original_name       string — the filename as uploaded
├── mime_type           string
├── size_bytes          unsignedBigInteger
├── issued_at           date, nullable
├── expires_at          date, nullable, indexed
├── notes               text, nullable
├── created_at, updated_at
└── deleted_at          SoftDeletes
```

Indexes: composite `(athlete_id, deleted_at)` for per-athlete listing; single `expires_at` for the expiring query.

**Acceptance:**
- Given the migration has run
- When a developer inspects the `documents` table
- Then every column and every index above exists, and the FK to `athletes` cascades on delete.

A document row **does not** carry a unique `(athlete_id, type)` constraint. Multiple medical certificates for the same athlete (one per year) are valid and expected.

#### P0.2 — Upload endpoint

`POST /api/v1/athletes/{athlete}/documents` accepts a multipart/form-data request. Validation is authoritative server-side; the client pre-validates for UX only.

Rules:
- `file` is required, must be one of `application/pdf`, `image/jpeg`, `image/png`, max 10 MB.
- `type` is required, must be one of the four enum values.
- `issued_at` and `expires_at` are optional ISO dates. If both are present, `expires_at` must be on or after `issued_at`.
- `notes` is optional, max 500 characters.
- The authenticated user must own an academy; the `{athlete}` must belong to that academy (else 403).

**Acceptance:**
- Given the authenticated user owns an academy containing athlete 42
- When they POST a 4 MB PDF with `type=medical_certificate`, `issued_at=2026-01-15`, `expires_at=2027-01-15` to `/api/v1/athletes/42/documents`
- Then the response is 201, the returned resource contains the persisted row, and the file exists at the `file_path` on disk.

- Given the authenticated user owns an academy that does not contain athlete 42
- When they POST to `/api/v1/athletes/42/documents`
- Then the response is 403 and no row or file is created.

- Given the authenticated user uploads a 15 MB file
- When the server processes the request
- Then the response is 422 with an error keyed to `file`, no row is inserted, and no partial file is left on disk.

#### P0.3 — List endpoint (per athlete)

`GET /api/v1/athletes/{athlete}/documents` returns all non-deleted documents for that athlete, newest `created_at` first. Paginated at 50 per page (one athlete is very unlikely to exceed this, but the envelope stays consistent with `/athletes`).

**Acceptance:**
- Given athlete 42 has three active documents and one soft-deleted document
- When the authenticated owner GETs `/api/v1/athletes/42/documents`
- Then the response is 200 with the three active documents and no reference to the deleted one.

#### P0.4 — Download endpoint

`GET /api/v1/documents/{id}/download` streams the raw file with a `Content-Disposition: attachment; filename="{original_name}"` header. The authenticated user must own the academy that contains the document's athlete.

**Acceptance:**
- Given the authenticated user owns the document's academy
- When they GET `/api/v1/documents/{id}/download`
- Then the response is 200, the body is the file bytes, the `Content-Type` is the stored `mime_type`, and the filename matches `original_name`.

- Given the authenticated user does not own the document's academy
- When they GET the download endpoint
- Then the response is 403 and the body does not contain file bytes.

#### P0.5 — Expiring query

`GET /api/v1/documents/expiring?days=N` returns all documents across the authenticated academy whose `expires_at` is in the next `N` days (default 30) OR already in the past, ordered by `expires_at` ascending. Each item includes enough athlete context (id, first_name, last_name) to link from the dashboard widget.

**Acceptance:**
- Given the academy has athletes with documents where `expires_at` is: 5 days away, 45 days away, 10 days in the past, and `NULL`
- When the owner GETs `/api/v1/documents/expiring?days=30`
- Then the response contains only the 5-days-away and 10-days-in-the-past documents, ordered with the expired one first, and each entry carries the owning athlete's id and name.

#### P0.6 — Update and delete

- `PUT /api/v1/documents/{id}` allows partial updates of `type`, `issued_at`, `expires_at`, and `notes`. It does **not** replace the file — replacing a file means uploading a new document row.
- `DELETE /api/v1/documents/{id}` soft-deletes the row **and** removes the physical file from disk (`Storage::delete`). There is no restore. The DB row remains for audit.

**Acceptance:**
- Given a document exists at `file_path=private/documents/abc.pdf`
- When the owner DELETEs `/api/v1/documents/{id}`
- Then the response is 204, the row has `deleted_at` set, and the file is no longer present on disk.

- Given the file has already been deleted out-of-band
- When the owner DELETEs the document
- Then the response is still 204 (the DB is the source of truth; a missing file is tolerated).

#### P0.7 — Per-athlete document list UI

A new route `/dashboard/athletes/:id/documents` renders a list of that athlete's documents. Each row shows document type, issue date, expiry date, a color badge, a download action, and a delete action (with confirmation).

Badge rules:
- **Green** — `expires_at` is more than 30 days in the future.
- **Yellow** — `expires_at` is 30 days or less in the future.
- **Red** — `expires_at` is in the past OR `expires_at` is null for a document of type `medical_certificate` (the one type where missing expiry is a red flag).
- **Neutral / no badge** — `expires_at` is null for any other type.

**Acceptance:**
- Given an athlete has a medical certificate with `expires_at = today + 15 days`
- When the owner opens `/dashboard/athletes/:id/documents`
- Then that row shows a yellow badge.

- Given an athlete has an ID card with `expires_at = null`
- When the owner opens the page
- Then that row shows no badge (neutral).

#### P0.8 — Upload dialog

From the per-athlete documents page, an "Add document" action opens a modal containing a form with: type selector, file picker, issue date, expiry date, notes. The form validates on the client (size, mime, enum values). On submit, the upload runs against the P0.2 endpoint; success closes the dialog, shows a toast, and refreshes the list; failure keeps the dialog open with the error surfaced and the metadata preserved.

**Acceptance:**
- Given the owner drops a 12 MB file into the file picker
- When they click "Upload"
- Then the dialog shows an inline error naming the size limit, the upload is not sent, and the rest of the form values are preserved.

- Given the owner fills the form and the server returns 422
- When the owner reads the error
- Then their type / dates / notes are still in the form so they can correct and resubmit.

#### P0.9 — Expiring documents dashboard panel

On `/dashboard/athletes`, above or beside the athlete table, a widget reads the P0.5 expiring endpoint with `days=30` and shows the count of expiring-or-expired documents. Clicking the widget navigates to a filtered cross-athlete view of those documents.

**Acceptance:**
- Given the academy has 7 documents expiring in the next 30 days and 2 already expired
- When the owner opens `/dashboard/athletes`
- Then the widget reads "9 documents need attention" (or equivalent copy).

- Given the widget count is zero
- When the owner opens the page
- Then the widget shows a muted "All documents up to date" state instead of a red count.

#### P0.10 — Storage and privacy

All uploaded files are stored on Laravel's `local` disk (`storage/app/private/`). The files are never served directly from the web root. There is no public symlink, no signed URL, and no `/storage/...` route exposing them. Access flows exclusively through the authenticated download endpoint (P0.4).

**Acceptance:**
- Given a document has been uploaded and its path is known
- When an unauthenticated request is made to any static URL pattern that could reach `storage/app/private/...`
- Then the request returns 404 or 403 and no file bytes are served.

### Nice-to-Have (P1) — fast follows

- **P1.1 — Inline per-field server errors.** Today 422 responses show the first error in a top banner. An inline mapping per control is nicer UX once the validation surface grows.
- **P1.2 — Drag-and-drop file area.** The upload dialog uses a basic file picker in P0; supporting drag-and-drop is a modest quality-of-life improvement.
- **P1.3 — Re-upload / replace shortcut.** A single action that opens the upload dialog pre-filled with the same `type` as an expiring document, so replacement is one click instead of "Add document → select type".
- **P1.4 — Filter the per-athlete documents list by type.** Useful once an athlete has 5+ rows, not before.

### Future Considerations (P2) — design for, do not build

The architecture must not preclude these. If any P0 choice would make them hard, flag it in review.

- **P2.1 — Email reminders before expiry (M5).** Fed directly by P0.1's `expires_at` index and P0.5's query. No schema change needed.
- **P2.2 — Document history view.** Since we never unique-constrain on `(athlete_id, type)` and we preserve soft-deleted rows, a future "show all historic medical certificates for this athlete" tab is a pure read.
- **P2.3 — S3 disk for production.** The `local` disk works for today's self-hosted Docker deployment. Moving to S3 is a config swap; no code changes expected because we use the `Storage` facade throughout.
- **P2.4 — Athlete self-service portal.** Athletes would read (not write) their own documents. Requires a separate auth surface.
- **P2.5 — HEIC image support.** iPhone native camera output. Rejected in P0 because Laravel/GD support is shaky. Revisit once we have real user demand.

## Success Metrics

### Leading indicators — measure within the first 30 days post-ship

| Metric | Target | Measurement |
|---|---|---|
| **Time to first upload** for a new academy, from landing on the athlete detail page to the first successful `POST /api/v1/athletes/{athlete}/documents` | p50 under 2 minutes; p90 under 5 minutes | Instrumented on the upload dialog via client timing |
| **Activation rate** — % of academies that upload at least one `medical_certificate` in their first 30 days | ≥ 60% (success); 80% (stretch) | Query `documents` grouped by `academy_id` via athlete join |
| **Error rate on upload** — % of `POST /api/v1/athletes/{athlete}/documents` that return 4xx or 5xx | ≤ 5% on 422; under 1% on 5xx | API log sampling / Laravel telescope |
| **Support tickets about expiry tracking** | 0 | Manual count from the support inbox |

### Lagging indicators — measure over 90 days

| Metric | Target | Measurement |
|---|---|---|
| **Expiry drop signal** — count of documents that transition from "valid" to "expired" without being replaced by a newer document of the same type within 60 days | Establish baseline in month 1; aim to reduce by 50% after M5 ships | Query `documents` comparing `expires_at` to `created_at` of any later sibling |
| **Retention delta** — % of M3-active academies (≥1 doc uploaded) still active at day 90 vs. M3-inactive | Active cohort retains at least 10 pp higher than inactive | Product analytics cohort |
| **% academies with all athletes in compliance** — every active athlete has a non-expired medical certificate | Report it; do not target a number yet — we need baseline | Reporting query |

### Target-setting caveat

Budojo has no real users yet at the time of M3 kick-off. The targets above are a working hypothesis based on the problem framing; they should be revisited after 30 days of production data.

## Open Questions

Blocking (must answer before or during implementation):

- **(engineering)** How do we version old documents in the UI without cluttering the P0.7 list? P0 shows only non-deleted rows; if an athlete replaces a certificate three times in a year, the list will show three rows simultaneously. Acceptable for P0 or do we hide superseded ones by default and add a "show history" toggle? Proposed answer: show all non-deleted rows in P0, revisit if the UX is noisy — but decide explicitly before M3.2.

Non-blocking (can resolve during or after):

- **(product)** Do we accept HEIC (iPhone native photo format) as an upload type? Default answer: no for M3. Flag as likely fast-follow if users complain.
- **(engineering)** Do we generate image thumbnails server-side for the list view? Default answer: no. The browser can render the raw JPEG/PNG at list-render time. Revisit if file sizes become a bandwidth concern.
- **(product)** Can a single document row hold multiple files (front + back of an ID)? Default answer: no — two separate rows. Revisit with user feedback.
- **(legal / GDPR)** The soft-delete-physical-delete policy means we cannot comply with a "restore accidentally deleted document" request. Is that acceptable tradeoff vs. GDPR right-to-erasure? Working assumption: yes, because GDPR wins. Confirm before launch.
- ~~**(engineering)** Retention policy when an athlete is soft-deleted — do the documents cascade-soft-delete and their files are wiped?~~ **Resolved at M3.1 kick-off: yes, via an `AthleteObserver` on the `deleting` event. Soft-deleting an athlete triggers soft-delete + `Storage::delete` on every one of their documents, consistent with the per-document GDPR policy already adopted. A hypothetical future "restore athlete" flow would NOT recover the files.**

## Timeline Considerations

M3 ships as **four sequential PRs**, each independently mergeable and each triggering a beta tag via semantic-release. No hard external deadline; cadence is limited by review capacity.

Ordering matters:

1. **M3.1 — Backend CRUD API** unblocks everything else. Must ship first. PEST feature tests prove every P0 API requirement end-to-end before any Angular code is written.
2. **M3.2 — Per-athlete documents list UI** depends on M3.1 but can be validated locally against the seeded roster.
3. **M3.3 — Upload dialog** depends on both M3.1 (API) and M3.2 (the list it refreshes). Ship after M3.2.
4. **M3.4 — Dashboard expiring widget** depends only on M3.1's expiring endpoint. Could in principle ship before M3.3, but shipping it last keeps the dashboard coherent (clicking a widget that lands on a still-empty-for-most page is confusing).

Dependencies:

- **Laravel Storage facade on `local` disk** — already configured, no work needed.
- **PrimeNG modules to add:** `FileUploadModule`, `DatePickerModule` (used), `DialogModule`, `BadgeModule` or reuse of `Tag`. None are blockers.
- **M5 (notifications)** sits downstream and is intentionally not a blocker. The data model shipped in M3.1 is sized to carry M5 without migration.

No contractual deadlines. The only external commitment this PRD makes is that M5 (email reminders) cannot start until M3 is shipped, because M5 reads M3's `expires_at` field.
