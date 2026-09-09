# Entity — `Athlete`

## Purpose

An `Athlete` represents a student enrolled at an `Academy`. This is the core roster record: first/last name, contact info, belt rank and stripes, enrollment status, and join date. Athletes are what instructors track day-to-day — past + future milestones (M3 documents, M4 attendance, v2.10.0 promotion history) all hang off this entity.

## Schema — `athletes`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete, **indexed** | Tenant scoping |
| `fee_tier_id` | bigint unsigned | nullable, FK `academy_fee_tiers.id`, **null on delete** | Which line of the academy's monthly price list this athlete is on (#1381). `null` — the value every athlete carries until someone moves them — means the academy's own `monthly_fee_cents`. See [`academy-fee-tier.md`](./academy-fee-tier.md) |
| `billing_period_months` | unsigned tinyint | not null, default `1` | How often this athlete is expected to pay (#1382) — the `BillingPeriod` month count. Not the same question as what they last paid: the app needs the expectation to answer "is anyone late". Default `1` (monthly) is every athlete today. See [`athlete-payment.md`](./athlete-payment.md) |
| `user_id` | bigint unsigned | FK `users.id`, **nullable**, **unique**, null on delete | M7 athlete-login link (#445). Null until the athlete accepts the owner's invite via `AcceptAthleteInvitationAction`; non-null afterwards. UNIQUE because `User::athlete()` is `HasOne` — two athletes pointing at the same user_id would silently break the relation invariant. Null-on-delete so a user being hard-deleted (GDPR Art. 17) does NOT remove the roster row — the link clears, the row stays, the owner can re-invite. |
| `first_name` | string(255) | not null | |
| `last_name` | string(255) | not null | |
| `email` | string(255) | nullable | Optional contact email — uniqueness is scoped per academy (two academies can have a Mario Rossi with the same email, one academy cannot) |
| `phone_country_code` | string(5) | nullable | E.164 prefix including the leading `+`, e.g. `+39`. Always paired with `phone_national_number` (both null OR both filled). See `Phone` business rule below. |
| `phone_national_number` | string(20) | nullable | Unformatted national digits (no spaces, no dashes), e.g. `3331234567`. Always paired with `phone_country_code`. |
| `website` | string(255) | nullable | Public website URL (#162). Validated as a parseable URL — bare `@handles` are rejected with 422. Independently nullable from the other contact links. |
| `facebook` | string(255) | nullable | Facebook profile URL (#162). Same shape as `website`. |
| `instagram` | string(255) | nullable | Instagram profile URL (#162). Same shape as `website`. |
| `date_of_birth` | date | nullable | Cast to `Carbon\Carbon` in the model |
| `belt` | string | not null | Cast to `App\Enums\Belt` backed enum — kids (`grey` / `yellow` / `orange` / `green`) + adults (`white` / `blue` / `purple` / `brown` / `black`) + senior coral and red (`red-and-black` / `red-and-white` / `red`) |
| `stripes` | tinyint unsigned | not null, default `0` | Range 0–6 on `black` (graus 1°–6°); 0–4 on every other belt. Enforced cross-field at the request layer via `Belt::maxStripes()` |
| `status` | string | not null | Cast to `App\Enums\AthleteStatus` backed enum (`active` / `inactive`) |
| `joined_at` | date | not null | When the athlete first enrolled |
| `photo_path` | string(255) | nullable | Relative path on the `public` disk of the athlete's photo (#1357). Null until the first `POST /athletes/{id}/photo`. The wire layer emits `photo_url` (full URL, with a cache-buster) via `AthleteResource`, never the raw path. Independent of `user_id`: an athlete needs no account to have a face, which matters because `athlete_accounts` is absent from the desktop runtime. |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable, **SoftDeletes** | Set when the athlete is "removed" via the API; the row remains in the DB |

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::athletes()`
- `belongsTo(AcademyFeeTier::class, 'fee_tier_id')` — the price tier they are on, or null. Eager-loaded by `AthleteController::index` and `SearchAcademyAction` alongside `academy`, because the resource resolves the applicable fee for every row and both halves of that rule are needed to avoid an N+1. See [`academy-fee-tier.md`](./academy-fee-tier.md).
- `belongsTo(User::class)` — the M7 athlete-login link (#445). Reads `athletes.user_id`. Null until the athlete accepts an invite. Inverse: `User::athlete()` (HasOne).
- `hasMany(AthleteInvitation::class)` — every invitation row ever generated for this athlete. The pending one (if any) is `->invitations()->pending()->first()`; revoked / expired / accepted rows stay around as audit trail. See [`athlete-invitation.md`](./athlete-invitation.md).
- `hasOne(AthleteInvitation::class)` via `latestActiveInvitation()` — the single row the SPA's athlete-detail card (#467, M7 PR-B-UI) renders. Returns the most recent **pending or accepted** invitation; revoked + expired audit rows are deliberately filtered out (the owner re-invites by sending a new invite, not by reading terminal history). Eager-loaded by `AthleteController::show` so `AthleteResource` can emit the `invitation` block without an extra query.
- `hasMany(Document::class)` — athlete's uploaded documents (ID, medical cert, etc.). See [`document.md`](./document.md).
- `morphOne(Address::class, 'addressable')` — structured address (#72b), see [`address.md`](./address.md).
- `hasMany(AthletePromotion::class)` — append-only belt + stripe history audit log (v2.10.0, #654), ordered `recorded_at DESC, id DESC`. See [`athlete-promotion.md`](./athlete-promotion.md).

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(academy_id)` — FK index, auto-created by Laravel, drives the academy-scoped list query
- `UNIQUE(academy_id, email)` — per-academy email uniqueness. **Note:** this applies to soft-deleted rows as well; to allow re-adding a "Mario Rossi" after soft-delete, uniqueness rules in Form Requests add a `whereNull('deleted_at')` filter. See the `StoreAthleteRequest` / `UpdateAthleteRequest` classes.

## Enums

### `App\Enums\Belt`

| Case | Value | Rank | Max stripes |
|---|---|---|---|
| `Grey` | `grey` | 1 | 4 |
| `Yellow` | `yellow` | 2 | 4 |
| `Orange` | `orange` | 3 | 4 |
| `Green` | `green` | 4 | 4 |
| `White` | `white` | 5 | 4 |
| `Blue` | `blue` | 6 | 4 |
| `Purple` | `purple` | 7 | 4 |
| `Brown` | `brown` | 8 | 4 |
| `Black` | `black` | 9 | **6** |
| `RedAndBlack` | `red-and-black` | 10 | 4 |
| `RedAndWhite` | `red-and-white` | 11 | 4 |
| `Red` | `red` | 12 | 4 |

Covers the full **IBJJF rank scale** on a single linear axis:

- **Youth** (kids/teens up to ~16) — grey, yellow, orange, green (added in #230).
- **Adult** — white, blue, purple, brown, black (the canonical progression).
- **Senior beyond black** — red-and-black (7° grau, coral), red-and-white (8° grau, coral), red (9° / 10° grau, grand master). Added in #229 — request from beta tester Luigi for "vendita all'esterno" credibility.

**Stripes per belt** (`Belt::maxStripes()`): 4 for every belt EXCEPT `Black`, which carries the IBJJF graus 1°–6° as `stripes 1..6`. The cap is enforced both at the request level (cross-field validation in `StoreAthleteRequest::validateStripesAgainstBelt` / `UpdateAthleteRequest::validateStripesAgainstBelt`) and at the SPA picker level (`MAX_STRIPES_PER_BELT` in `client/src/app/core/services/athlete.service.ts`). Sub-progressions inside each kids belt (e.g. grey-white, grey, grey-black) are not modelled — only the four base colours.

### `App\Enums\AthleteStatus`

| Case | Value | Meaning |
|---|---|---|
| `Active` | `active` | Currently training and paying |
| `Inactive` | `inactive` | No longer attending but not deleted — kept for history and belt tracking |

## Business rules

- **CSV import (#1346).** `POST /api/v1/athletes/import` creates athletes in bulk, guarded by the same capability as creating one — `AthletesCreateUpdate`. **It goes through `CreateAthleteAction`**, the same path the form uses, so the observers, the academy counters and the audit trail all fire; writing rows straight into SQLite would produce a roster subtly unlike one typed by hand, and those bugs surface weeks later never looking like an import problem. **Every row is validated against `App\Support\AthleteFieldRules`** — extracted from `StoreAthleteRequest` so there is one definition of a valid athlete and a rule added to the form cannot silently skip the path that creates sixty records at once.

  **Two calls, one import.** The first sends the file and answers with the columns found, the mapping guessed and what every row *would* do; the second sends it again with `validate_only=false`. The flag **defaults to a dry run**, so a caller that forgets it gets a preview rather than sixty athletes. The two-step shape is the feature: a real file's dates are ambiguous (`03/04/2019`), its belts are in another language, and no parser settles that reliably — showing the owner what would be written does.

  **Normalisation** lives in `App\Support\Import`, one class per problem: `BeltText` (`Blu` / `cintura blu` / `blue`, and both Italian genders), `DateText` (day-first `gg/mm/aaaa`, ISO, two-digit years on Excel's 00-68 pivot; refuses 31 February rather than rolling it to 3 March), `PhoneText` (one column split into the stored pair, using the academy's own dial code when the number carries none), `AthleteCsv` (delimiter detection — Italian Excel writes `;` — and BOM stripping), `AthleteColumnMap` (Italian and English header names, matched exactly, never by substring, because `cognome` contains `nome`).

  **Defaults:** `status` is `active` and `joined_at` is today when the column is absent; `stripes` is `0`. `first_name`, `last_name` and `belt` have none — a mapping missing any of them is refused with `422` naming them, rather than returning one identical error per row. Belt is strict where status is lenient on purpose: a guessed belt invents a rank on a real person's record, whereas anyone in the file is by definition someone the academy trains.

  **Duplicates are skipped, visibly.** A row whose name matches an athlete already on the roster — or one earlier in the same file — comes back `duplicate` and is not written. A **known** date of birth on both sides that differs makes them two people, so a father and son of the same name both import. Where either side has no date of birth the name alone decides, which will occasionally skip a genuine namesake: the trade is deliberate, because that row is visible in the preview where someone can act on it, while a roster silently doubled by a second import run is found weeks later with attendance recorded against both copies.

  **One transaction for the whole file**, and rows are numbered as Excel shows them — the header is row 1. Limits: 2 MB, 2000 rows. `.xlsx` is not read; "Save as CSV" is one menu item and a spreadsheet library is a heavy thing to ship inside a desktop installer.
- **Photo lifecycle** (#1357). Uploaded via `POST /api/v1/athletes/{athlete}/photo` (multipart, field `photo`, `image` + `mimes:jpeg,jpg,png,webp`, max 2 MB, throttled 10/min). `UploadAthletePhotoAction` stores the original bytes at `athletes/photos/{athlete-id}.{ext}` on the `public` disk — no server-side resize, because GD in the API image ships with PNG support only; the SPA frames it with CSS `object-fit: cover`. `jpeg` is normalised to `jpg` so the path does not depend on which browser uploaded it. Same-extension replacements overwrite in place; a different extension unlinks the orphan. `DELETE /api/v1/athletes/{athlete}/photo` unlinks and clears the column, and is idempotent — removing a photo that is not there still answers 200 with `photo_url: null`. **Both endpoints re-check academy ownership and answer 403 otherwise**: the storage path is derived from the route parameter, so that check is what stops one academy writing into another's namespace. SVG is rejected here as it is for user avatars — it is a script vector, and making it safe needed a hand-rolled sanitiser on the academy-logo path that a head-shot does not justify. `photo_url` carries a `?v={updated_at}` cache-buster, without which a same-format replacement would leave the browser showing the picture that was just replaced.

- **The billing period is an expectation, not a record (#1382).** `billing_period_months` says how often this athlete is *meant* to pay; `athlete_payments.period_months` says what a given payment actually covered. Recording a payment without an explicit `period_months` uses the athlete's, and the amount is the monthly fee times the months. Exposed on the resource as `billing_period_months` and writable on create + update.
- **The roster says how the month is paid for, not whether (#1402).** `AthleteResource` emits `payment_coverage` — `monthly` / `quarterly` / `half_yearly` / `annual` / `carnet` / `none` — resolved by `App\Support\MonthCoverage` from the payment covering the month and the athlete's spendable carnet. **The fee wins over the carnet**, which is the rule `ReconcileCarnetEntriesAction` has applied since #1380 and not a second ordering invented for the UI. `paid_current_month` stays beside it with its narrower meaning: a carnet is not a paid month, and the unpaid widget, the `?paid` filter and both reminders still read that one.
- **The roster counts sessions, and the count is not stored (#1447).** `AthleteResource` emits `attendance_month_count` and `attendance_total_count` — attendances in the current calendar month, and in the current **season** (#1484: the academy's training year, floored per row at the athlete's `joined_at`; it counted their whole history until then) — selected by the list endpoint as `withCount` aliases rather than derived from loaded rows. **Both are `null` on `GET /athletes/{id}`**, where the query does not select them: null means *not asked for*, and zero is a real answer about someone who has not trained, so a reader must not collapse the two. They count **days, not rows**: at most one live `attendance_records` row exists per (athlete, day) — enforced by `MarkAttendanceAction` on insert, which is why the table carries no DB-level unique index — and the `SoftDeletes` scope keeps a day corrected by delete-and-reinsert from counting twice. Sorting on either (`sort_by=attendance_month|attendance_total`) tiebreaks on `last_name asc, first_name asc` **whichever way the count sorts**: counts are small integers over a roster of hundreds, so ties are the common case, and an unstable order lets an athlete appear on two pages or none.
- **The monthly fee is resolved, not stored (#1381).** `AthleteResource` emits `fee_tier` (the tier block, or null) and `monthly_fee_cents` — what this athlete actually pays, from `App\Support\MonthlyFee::forAthlete()`: the tier's amount if they are on one, the academy's flat fee otherwise. The SPA reads `monthly_fee_cents` rather than re-deriving the fallback, which is what stops the two disagreeing. `fee_tier_id` is writable on create and update, and the `exists` rule is scoped to the athlete's own academy.
- **Academy scoping.** Every athlete query on every endpoint is filtered by `academy_id = auth()->user()->academy->id`. The controller, not a global scope, enforces this — matching the rest of the codebase.
- **Soft-delete semantics.** `DELETE /api/v1/athletes/{id}` sets `deleted_at` but never removes the row. Future reports (attendance history, belt promotions) can still reference historic athletes. The list endpoint never returns soft-deleted rows.
- **Soft-delete cascades to documents.** An `AthleteObserver` (wired via `#[ObservedBy]` on the model) catches the `deleting` event and, for every `Document` belonging to the athlete, soft-deletes the row AND wipes the file from the `local` disk via `Storage::delete`. This is the GDPR-friendly policy locked in the M3 PRD — there is no "restore athlete → restore documents" flow.
- **Email uniqueness ignores soft-deleted rows.** You can re-add a previously-deleted Mario Rossi with the same email, and the Form Request's `whereNull('deleted_at')` clause allows it.
- **Stripes range is per-belt.** `Black` allows `0..6` to track the IBJJF graus 1°–6°; every other belt allows `0..4`. The static rule on the FormRequest is `min:0|max:6` (the global ceiling), and the per-belt cap is then enforced cross-field in `withValidator` against `Belt::maxStripes()`. The DB column is an unsigned tinyint with no CHECK constraint.
- **Address (#72b).** Athletes own at most one polymorphic `Address` row via `morphOne(Address::class, 'addressable')`. Update semantics on `PUT /api/v1/athletes/{id}` (Laravel's resource route also accepts `PATCH`): send `address: { line1, line2, city, postal_code, province, country }` to upsert in place, `address: null` to clear (delete the morph row), or omit the key to leave untouched. Same two-layer enforcement as `Academy`: DB UNIQUE index on `(addressable_type, addressable_id)` plus `SyncAddressAction`'s atomic `updateOrCreate`. On hard delete (`forceDelete`) the `AthleteObserver::forceDeleted` hook wipes the address; soft delete leaves it in place. See [`address.md`](./address.md).
- **Phone is a structured pair (#75).** The two phone columns are jointly nullable: either both are `null` (no phone on file) or both carry a value. The FormRequest enforces this via `required_with` between the two fields, validates the country code with `regex:/^\+[1-9][0-9]{0,3}$/`, validates the national number with `regex:/^[0-9]+$/`, and runs a cross-field `withValidator` check that concatenates the pair and feeds it to `libphonenumber-for-php`'s `isValidNumber()` — combinations that are well-formed individually but unreachable in any numbering plan (e.g. `+39` + `1`) are rejected. The DB stores the raw national digits; formatting for display is the client's job.
- **Paginated list is 20 per page.** Configured in `AthleteController@index`. Filters: `belt` (enum), `status` (enum), `paid` (`yes`|`no` — has a payment record for the current calendar month or not), and `q` (free-text token-AND search across `first_name` + `last_name`, case-insensitive). Sort: `sort_by` ∈ {`first_name`, `last_name`, `belt`, `joined_at`, `created_at`, `attendance_month`, `attendance_total`} with `sort_order` (`asc`|`desc`, default `desc`). `belt` is rank-aware (kids `grey < yellow < orange < green` < adults `white < blue < purple < brown < black` < senior `red-and-black < red-and-white < red`) with `stripes` desc + `last_name` asc as stable tiebreakers. Page via `?page=N`. The OpenAPI contract at `docs/api/v1.yaml` is the canonical reference for parameter shape and defaults.

## Related endpoints

- `GET /api/v1/athletes` — paginated list with optional `belt` / `status` filters
- `POST /api/v1/athletes` — create
- `GET /api/v1/athletes/{id}` — single athlete
- `PUT /api/v1/athletes/{id}` — partial update (all fields optional)
- `DELETE /api/v1/athletes/{id}` — soft-delete
- `POST /api/v1/athletes/import` — bulk create from a CSV; dry run by default (#1346)

## Related tables

- `academies` — see [`academy.md`](./academy.md)
- `athlete_payments` — see [`athlete-payment.md`](./athlete-payment.md). Drives the `paid_current_month` derivation on `AthleteResource` and the `?paid=yes|no` list filter. The full `/athletes/{athlete}/payments` family of endpoints lives there.

## Future

- **M4** will add an `attendance` table with `athlete_id` FK.
