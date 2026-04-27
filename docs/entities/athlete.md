# Entity — `Athlete`

## Purpose

An `Athlete` represents a student enrolled at an `Academy`. This is the core roster record: first/last name, contact info, belt rank and stripes, enrollment status, and join date. Athletes are what instructors track day-to-day — future milestones (M3 documents, M4 attendance, M6 promotions) all hang off this entity.

## Schema — `athletes`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete, **indexed** | Tenant scoping |
| `first_name` | string(255) | not null | |
| `last_name` | string(255) | not null | |
| `email` | string(255) | nullable | Optional contact email — uniqueness is scoped per academy (two academies can have a Mario Rossi with the same email, one academy cannot) |
| `phone_country_code` | string(5) | nullable | E.164 prefix including the leading `+`, e.g. `+39`. Always paired with `phone_national_number` (both null OR both filled). See `Phone` business rule below. |
| `phone_national_number` | string(20) | nullable | Unformatted national digits (no spaces, no dashes), e.g. `3331234567`. Always paired with `phone_country_code`. |
| `date_of_birth` | date | nullable | Cast to `Carbon\Carbon` in the model |
| `belt` | string | not null | Cast to `App\Enums\Belt` backed enum (`white` / `blue` / `purple` / `brown` / `black`) |
| `stripes` | tinyint unsigned | not null, default `0` | Range 0–4, enforced at validation layer |
| `status` | string | not null | Cast to `App\Enums\AthleteStatus` backed enum (`active` / `suspended` / `inactive`) |
| `joined_at` | date | not null | When the athlete first enrolled |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable, **SoftDeletes** | Set when the athlete is "removed" via the API; the row remains in the DB |

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::athletes()`
- `hasMany(Document::class)` — athlete's uploaded documents (ID, medical cert, etc.). See [`document.md`](./document.md).
- `morphOne(Address::class, 'addressable')` — structured address (#72b), see [`address.md`](./address.md).

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(academy_id)` — FK index, auto-created by Laravel, drives the academy-scoped list query
- `UNIQUE(academy_id, email)` — per-academy email uniqueness. **Note:** this applies to soft-deleted rows as well; to allow re-adding a "Mario Rossi" after soft-delete, uniqueness rules in Form Requests add a `whereNull('deleted_at')` filter. See the `StoreAthleteRequest` / `UpdateAthleteRequest` classes.

## Enums

### `App\Enums\Belt`

| Case | Value |
|---|---|
| `White` | `white` |
| `Blue` | `blue` |
| `Purple` | `purple` |
| `Brown` | `brown` |
| `Black` | `black` |

Represents IBJJF adult belt ranks. Kids/youth belts are not modeled — they are out of scope until explicitly requested.

### `App\Enums\AthleteStatus`

| Case | Value | Meaning |
|---|---|---|
| `Active` | `active` | Currently training and paying |
| `Suspended` | `suspended` | Temporarily not attending (injury, travel); retained on the roster |
| `Inactive` | `inactive` | No longer attending but not deleted — kept for history and belt tracking |

## Business rules

- **Academy scoping.** Every athlete query on every endpoint is filtered by `academy_id = auth()->user()->academy->id`. The controller, not a global scope, enforces this — matching the rest of the codebase.
- **Soft-delete semantics.** `DELETE /api/v1/athletes/{id}` sets `deleted_at` but never removes the row. Future reports (attendance history, belt promotions) can still reference historic athletes. The list endpoint never returns soft-deleted rows.
- **Soft-delete cascades to documents.** An `AthleteObserver` (wired via `#[ObservedBy]` on the model) catches the `deleting` event and, for every `Document` belonging to the athlete, soft-deletes the row AND wipes the file from the `local` disk via `Storage::delete`. This is the GDPR-friendly policy locked in the M3 PRD — there is no "restore athlete → restore documents" flow.
- **Email uniqueness ignores soft-deleted rows.** You can re-add a previously-deleted Mario Rossi with the same email, and the Form Request's `whereNull('deleted_at')` clause allows it.
- **Stripes range `0..4`.** Enforced at the FormRequest level via `min:0|max:4`. The DB column is an unsigned tinyint with no CHECK constraint.
- **Address (#72b).** Athletes own at most one polymorphic `Address` row via `morphOne(Address::class, 'addressable')`. Update semantics on `PUT /api/v1/athletes/{id}` (Laravel's resource route also accepts `PATCH`): send `address: { line1, line2, city, postal_code, province, country }` to upsert in place, `address: null` to clear (delete the morph row), or omit the key to leave untouched. Same two-layer enforcement as `Academy`: DB UNIQUE index on `(addressable_type, addressable_id)` plus `SyncAddressAction`'s atomic `updateOrCreate`. On hard delete (`forceDelete`) the `AthleteObserver::forceDeleted` hook wipes the address; soft delete leaves it in place. See [`address.md`](./address.md).
- **Phone is a structured pair (#75).** The two phone columns are jointly nullable: either both are `null` (no phone on file) or both carry a value. The FormRequest enforces this via `required_with` between the two fields, validates the country code with `regex:/^\+[1-9][0-9]{0,3}$/`, validates the national number with `regex:/^[0-9]+$/`, and runs a cross-field `withValidator` check that concatenates the pair and feeds it to `libphonenumber-for-php`'s `isValidNumber()` — combinations that are well-formed individually but unreachable in any numbering plan (e.g. `+39` + `1`) are rejected. The DB stores the raw national digits; formatting for display is the client's job.
- **Paginated list is 20 per page.** Configured in `AthleteController@index`. Filters: `belt` (single enum value) and `status` (single enum value). Page via `?page=N`.

## Related endpoints

- `GET /api/v1/athletes` — paginated list with optional `belt` / `status` filters
- `POST /api/v1/athletes` — create
- `GET /api/v1/athletes/{id}` — single athlete
- `PUT /api/v1/athletes/{id}` — partial update (all fields optional)
- `DELETE /api/v1/athletes/{id}` — soft-delete

## Related tables

- `academies` — see [`academy.md`](./academy.md)

## Future

- **M4** will add an `attendance` table with `athlete_id` FK.
- **M6** — Belt promotion history (changes to `belt` / `stripes` recorded in a dedicated table instead of just mutating the athlete row).
