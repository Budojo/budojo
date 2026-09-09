# Entity — `Academy`

## Purpose

An `Academy` is the **tenant boundary** of Budojo. Every domain object in the app (athletes today, documents / attendance / promotions in future milestones) belongs to exactly one academy. The academy is also the unit that scopes authorization: when a user makes an authenticated request, all reads and writes are implicitly filtered to their academy.

Today the model is 1-to-1 with `User` — one owner per academy, one academy per owner. This is the `academies.user_id` unique constraint. Multi-owner or staff roles are future work.

## Schema — `academies`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `user_id` | bigint unsigned | FK `users.id`, cascade on delete, **unique** | Owner of the academy. Unique ensures 1-to-1 with User |
| `name` | string(255) | not null | Display name ("Gracie Barra Lisboa") |
| `slug` | string(255) | not null, **unique** | URL-friendly identifier; auto-generated at creation as `Str::slug(name) . '-' . random(8)` |
| `logo_path` | string(255) | nullable | Relative path on the `public` disk; absent until the owner uploads a logo. The API resource resolves it to a public `logo_url` via `Storage::disk('public')->url(...)` |
| `phone_country_code` | varchar(5) | nullable | E.164 country prefix incl. `+` (e.g. `+39`). Pair with `phone_national_number` — both null OR both filled, enforced by `required_with` in the FormRequest (#161). Same shape as the athletes pair. Settable via `PATCH /api/v1/academy` |
| `phone_national_number` | varchar(20) | nullable | Unformatted national digits (no spaces / dashes / parentheses). Validated together with `phone_country_code` via libphonenumber. Settable via `PATCH /api/v1/academy` |
| `website` | string(255) | nullable | Public website URL (#162). Validated as a parseable URL — bare `@handles` are rejected with 422. Independently nullable from the other contact links. |
| `facebook` | string(255) | nullable | Facebook page URL (#162). Same shape as `website`. |
| `instagram` | string(255) | nullable | Instagram profile URL (#162). Same shape as `website`. |
| `monthly_fee_cents` | unsigned int | nullable | Academy-wide membership fee, **stored in cents** to avoid float pitfalls (€95.00 = `9500`). Since #1381 this is the **default for athletes on no price tier** rather than the only fee — an academy with a price list overrides it per athlete; see [`academy-fee-tier.md`](./academy-fee-tier.md). `null` means "fee not configured" — the payments endpoints reject `POST` with 422 for any athlete no tier covers either. Settable via `PATCH /api/v1/academy` |
| `carnet_price_cents` | unsigned int | nullable | Price of one entry carnet, **in cents** (€70.00 = `7000`). `null` on either this or `carnet_entries` means "this academy does not sell carnets" — `POST /athletes/{id}/carnets` rejects with 422 until both are set. Snapshotted onto each carnet at sale (#1364); see [`carnet.md`](./carnet.md). Settable via `PATCH /api/v1/academy` |
| `carnet_entries` | unsigned tinyint | nullable | How many entries one carnet holds (default offering: `10`). Snapshotted at sale, so changing it never resizes carnets already sold. Settable via `PATCH /api/v1/academy` |
| `training_days` | json (list&lt;int&gt;) | nullable | Weekdays the academy trains on, Carbon `dayOfWeek` ints (0=Sun…6=Sat). Cast to `array` on the model. `null` means "schedule not configured" — the daily check-in UI falls back to all-weekdays in that state. Kept alive as a **denormalised cache of the current schedule** — the source of truth for historical reads is the `academy_schedules` table (#1094); see [`academy-schedule.md`](./academy-schedule.md). Settable on create + update |
| `season_start_month` | unsigned tinyint | nullable | Month the academy's training year restarts in, 1-12 (#1484). `null` is not "no season" — it is "nobody has chosen", which `App\Support\Season` answers with September. Stored as a month rather than a date because a season is a recurring boundary and not an event. Settable via `PATCH /api/v1/academy` |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `belongsTo(User::class, 'user_id')` — exposed as the `owner()` method
- `hasMany(Athlete::class)` — all athletes in this academy
- `hasMany(AcademyFeeTier::class)` — the monthly price list (#1381); empty on an academy that charges one flat fee. See [`academy-fee-tier.md`](./academy-fee-tier.md)
- `hasMany(AcademySchedule::class)` — schedule history (#1094); see [`academy-schedule.md`](./academy-schedule.md). Read-side helpers: `scheduleForDate(Carbon)`, `currentSchedule()`, `nextSchedule()`
- `morphOne(Address::class, 'addressable')` — structured address (#72), see [`address.md`](./address.md)

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(user_id)` — enforces one-academy-per-user
- `UNIQUE(slug)` — enforces URL uniqueness

## Business rules

- **Creation is one-shot.** `POST /api/v1/academy` fails with 409 if the owner already has one — only one academy per user, ever.
- **`name`, `address`, `logo_path`, `monthly_fee_cents`, `carnet_price_cents`, `carnet_entries`, `training_days`, and `season_start_month` are mutable** via `PATCH /api/v1/academy` (and the dedicated `/academy/logo` endpoints for the logo file). `slug` is intentionally immutable — renames keep the original permalink stable.
- **Address (#72) is a separate polymorphic entity.** `addresses` lives in its own table (`addressable_type` + `addressable_id`); the academy exposes it via `morphOne`. The 1:1 invariant is NOT carried by `morphOne` alone (Eloquent's morph relation just returns the first match) — it's enforced by the UNIQUE index on `(addressable_type, addressable_id)` in the `addresses` table, plus `SyncAcademyAddressAction` going through the relation's `updateOrCreate(...)` so concurrent inserts hit the constraint instead of producing duplicates. PATCH semantics: send `address: { line1, line2, city, postal_code, province, country }` to upsert in place, `address: null` to clear (delete the row), or omit the key to leave untouched. See [`address.md`](./address.md).
- **Slug is server-generated, not user-supplied.** The shape is `slugified(name) + '-' + 8 lowercase random chars`, e.g. `gracie-barra-lisboa-a3f9kx2b`. This guarantees uniqueness without exposing collision logic to the user.
- **The fee that applies to an athlete snapshots into payment rows.** When `RecordAthletePaymentAction` records a payment, it copies the amount `App\Support\MonthlyFee::forAthlete()` resolves — the athlete's price tier if they are on one, the academy's *current* `monthly_fee_cents` otherwise (#1381) — into `athlete_payments.amount_cents`. Future fee or tier changes therefore do NOT rewrite past payment history.
- **"Does this academy charge anything" is no longer `monthly_fee_cents IS NOT NULL` (#1381).** An academy priced only by tier leaves the flat fee empty, so the two scheduled commands read `Academy::scopeChargingAFee()` (a flat fee **or** a price list — zero counts, the owner is still tracking payments) and `scopeChargingMoreThanNothing()` (a fee above zero, so somebody actually owes money). The two are deliberately separate: collapsing them would silently change one caller. The SPA mirrors the first through the resource's `fee_tier_count` and `academyChargesAFee()`.
- **The carnet offering snapshots the same way.** `SellCarnetAction` copies `carnet_price_cents` and `carnet_entries` onto the `carnets` row at sale. Repricing or resizing the offering therefore never rewrites carnets already sold — see [`carnet.md`](./carnet.md).
- **`training_days` changes are historized, not overwritten (#1094).** Every `PATCH /api/v1/academy` that touches `training_days` inserts a row into `academy_schedules` with `effective_from = today` (idempotent on a same-day re-PATCH — the lookup is `(academy_id, effective_from)`). The `academies.training_days` column is updated in lockstep so existing readers that just want the "current" schedule keep working; the schedule-history table is the source of truth for historical reads. See [`academy-schedule.md`](./academy-schedule.md) for the read API.
- **The season is a window, and the roster measures against it (#1484).** `App\Support\Season::startFor()` resolves `season_start_month` against a given moment: a date before this year's boundary belongs to the season that opened the *previous* year, so 15 March 2026 sits in the season that began 1 September 2025. `GET /api/v1/athletes` scopes `attendance_total_count` to that window, floored per row at the athlete's own `joined_at` — someone who joined in November cannot have attended September's sessions, and counting them against the whole season reports the academy's calendar as if it were their record. The resource returns the resolved `season_start` and `season_label` alongside the raw month so the SPA never re-derives the boundary.
- **The SPA's `/dashboard` routes are guarded by `hasAcademyGuard`.** A logged-in user without an academy is redirected to `/setup`. A user with an academy trying to visit `/setup` is redirected to `/dashboard`.
- **Academy-scoping on every authenticated request** is handled in the controllers, not in a policy or model scope — we match the Athlete pattern. `StoreAthleteRequest::authorize()` and similar check `$user->academy !== null`; the controller then uses `$user->academy->id` to filter queries.
- **No soft-delete.** Deleting a user cascades to their academy which cascades to their athletes.

## Related endpoints

- `POST /api/v1/academy` — create (one-shot, 409 if the user already has one)
- `GET /api/v1/academy` — fetch the authenticated user's academy; returns 404 if none (SPA uses this to detect first-login state)
- `PATCH /api/v1/academy` — partial update of `name`, `address`, `monthly_fee_cents`, `carnet_price_cents`, `carnet_entries`, `training_days`, `season_start_month`
- `POST /api/v1/academy/logo` — upload/replace logo
- `DELETE /api/v1/academy/logo` — remove logo
- `GET|POST /api/v1/academy/fee-tiers`, `PATCH|DELETE /api/v1/academy/fee-tiers/{tier}` — the monthly price list (#1381); see [`academy-fee-tier.md`](./academy-fee-tier.md)

## Related tables

- `users` — see [`user.md`](./user.md)
- `athletes` — see [`athlete.md`](./athlete.md)
