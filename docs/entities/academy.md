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
| `martial_art` | varchar(16) | not null, default `bjj` | What the academy teaches (#1800): `App\Enums\MartialArt` — `bjj`, `judo`, `karate`, `taekwondo`. The default fills rows that predate the column and a backup restored from before it (the desktop migrates at boot); it never answers a request — `POST /api/v1/academy` requires the field. The model mirrors the default in `$attributes`, so a factory or seeder academy is BJJ in memory too. Its ladder and starter programmes come from the registry, see business rules |
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
| `carnet_entry_unit` | varchar(8) | not null, default `lesson` | What one carnet entry pays for (#1576) — `lesson` or `day` (`App\Enums\CarnetEntryUnit`). Not nullable: every academy has an answer whether or not it has thought about it, and `lesson` is what every carnet meant before the timetable existed. **Not** snapshotted — it is a rule of the ledger, not of the sale, so changing it recounts every carnet ever sold; see [`carnet-entry.md`](./carnet-entry.md). Settable via `PATCH /api/v1/academy` |
| `training_days` | json (list&lt;int&gt;) | nullable | Weekdays the academy trains on, Carbon `dayOfWeek` ints (0=Sun…6=Sat). Cast to `array` on the model. `null` means "schedule not configured" — the daily check-in UI falls back to all-weekdays in that state. Kept alive as a **denormalised cache of the current schedule** — the source of truth for historical reads is the `academy_schedules` table (#1094); see [`academy-schedule.md`](./academy-schedule.md). Settable on create + update |
| `season_start_month` | unsigned tinyint | nullable | Month the academy's training year restarts in, 1-12 (#1484). `null` is not "no season" — it is "nobody has chosen", which `App\Support\Season` answers with September. Stored as a month rather than a date because a season is a recurring boundary and not an event. Settable via `PATCH /api/v1/academy` |
| `billing_from` | date | nullable | The month Budojo became where this academy's fees are recorded (#1742), pinned to the 1st. `null` means no floor — the ledger behaves exactly as it did before the column existed, which is what a restore from an older backup gets. Backfilled once to the month of `created_at`. Settable via `PATCH /api/v1/academy` |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `belongsTo(User::class, 'user_id')` — exposed as the `owner()` method
- `hasMany(Athlete::class)` — all athletes in this academy
- `hasMany(AcademyFeeTier::class)` — the monthly price list (#1381); empty on an academy that charges one flat fee. See [`academy-fee-tier.md`](./academy-fee-tier.md)
- `hasMany(AcademySchedule::class)` — schedule history (#1094); see [`academy-schedule.md`](./academy-schedule.md). Read-side helpers: `scheduleForDate(Carbon)`, `currentSchedule()`, `nextSchedule()`
- `hasMany(AcademyClass::class)` — the weekly timetable (#1562); empty on an academy that never set one up, which changes nothing. See [`academy-class.md`](./academy-class.md)
- `hasMany(Lesson::class)` — every lesson actually held, the occurrences the classes produced (#1562). See [`lesson.md`](./lesson.md)
- `hasMany(SyllabusTopic::class)` — the programme (#1563), positions and techniques alike; empty until the academy starts one. See [`syllabus-topic.md`](./syllabus-topic.md)
- `morphOne(Address::class, 'addressable')` — structured address (#72), see [`address.md`](./address.md)

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(user_id)` — enforces one-academy-per-user
- `UNIQUE(slug)` — enforces URL uniqueness

## Business rules

- **The martial art decides the ladder and the programmes; the academy stores only which art (#1800).** Everything that follows from it lives in `server/database/seed-data/martial-arts/<art>.json`, read through `App\Support\MartialArt\MartialArtProfile`: the **ladder** (belts in rank order, each with its stripe cap, what a stripe counts — `stripe`, `dan`, `poom` — and the number its first step is shown as) and the **starter programmes** the syllabus seed may copy. `AcademyResource` emits `martial_art`, `grades` (the ladder, lowest first), `martial_art_locked` and `syllabus_programmes`, so the SPA never keeps a second copy of a ladder. Sources per file: BJJ is byte-for-byte the IBJJF ranks and caps that `Belt::rank()`/`maxStripes()` carried before; judo and karate follow the FIJLKAM *Regolamento Organico Federale* Art. 92 (6 kyu, black 1st–5th dan, red-and-white 6th–8th, red 9th–10th), plus the kids' half-belts clubs award, with up to three *tacche* on a coloured karate belt; taekwondo is the WT/FITA ten-kup ladder with half-belts and the poom. PRD: [`../specs/martial-arts.md`](../specs/martial-arts.md).
- **The martial art is changeable only while nothing in the academy is shaped by it.** `PATCH /api/v1/academy` refuses a *different* `martial_art` with 422 once the academy has any athlete, class, lesson or syllabus topic — **soft-deleted athletes and topics included**, and lessons counted separately from classes because they outlive them (`academy_class_id` is null-on-delete, `kind` is a snapshot). One predicate, `App\Support\MartialArt\MartialArtLock`, answers both the request and `martial_art_locked`. Sending the value the academy already has is always accepted, so a form that posts every field does not fail on the one it did not touch; `null` is refused.

- **Creation is one-shot.** `POST /api/v1/academy` fails with 409 if the owner already has one — only one academy per user, ever.
- **`name`, `address`, `logo_path`, `monthly_fee_cents`, `carnet_price_cents`, `carnet_entries`, `carnet_entry_unit`, `training_days`, `season_start_month`, and `billing_from` are mutable** via `PATCH /api/v1/academy` (and the dedicated `/academy/logo` endpoints for the logo file). `slug` is intentionally immutable — renames keep the original permalink stable.
- **Address (#72) is a separate polymorphic entity.** `addresses` lives in its own table (`addressable_type` + `addressable_id`); the academy exposes it via `morphOne`. The 1:1 invariant is NOT carried by `morphOne` alone (Eloquent's morph relation just returns the first match) — it's enforced by the UNIQUE index on `(addressable_type, addressable_id)` in the `addresses` table, plus `SyncAcademyAddressAction` going through the relation's `updateOrCreate(...)` so concurrent inserts hit the constraint instead of producing duplicates. PATCH semantics: send `address: { line1, line2, city, postal_code, province, country }` to upsert in place, `address: null` to clear (delete the row), or omit the key to leave untouched. See [`address.md`](./address.md).
- **Slug is server-generated, not user-supplied.** The shape is `slugified(name) + '-' + 8 lowercase random chars`, e.g. `gracie-barra-lisboa-a3f9kx2b`. This guarantees uniqueness without exposing collision logic to the user.
- **The fee that applies to an athlete snapshots into payment rows.** When `RecordAthletePaymentAction` records a payment, it copies the amount `App\Support\MonthlyFee::forAthlete()` resolves — the athlete's price tier if they are on one, the academy's *current* `monthly_fee_cents` otherwise (#1381) — into `athlete_payments.amount_cents`. Future fee or tier changes therefore do NOT rewrite past payment history.
- **"Does this academy charge anything" is no longer `monthly_fee_cents IS NOT NULL` (#1381).** An academy priced only by tier leaves the flat fee empty, so the two scheduled commands read `Academy::scopeChargingAFee()` (a flat fee **or** a price list — zero counts, the owner is still tracking payments) and `scopeChargingMoreThanNothing()` (a fee above zero, so somebody actually owes money). The two are deliberately separate: collapsing them would silently change one caller. The SPA mirrors the first through the resource's `fee_tier_count` and `academyChargesAFee()`.
- **The carnet offering snapshots the same way.** `SellCarnetAction` copies `carnet_price_cents` and `carnet_entries` onto the `carnets` row at sale. Repricing or resizing the offering therefore never rewrites carnets already sold — see [`carnet.md`](./carnet.md).
- **What one entry pays for does not snapshot (#1576).** `carnet_entry_unit` is a rule of the ledger, not of the sale: with a timetable an athlete can be in two classes on one evening, and whether that spends one entry (`day`) or two (`lesson`, the default) is the academy's call for every carnet it has sold, not per pack. A `PATCH /api/v1/academy` that changes it therefore rebuilds every ledger in the academy through `ReconcileAcademyCarnetsAction`, in the same transaction — a setting that says one thing over a ledger charging another is the drift the derived balance exists to rule out. `null` is rejected: there is no "not configured" to express.
- **`training_days` changes are historized, not overwritten (#1094).** Every `PATCH /api/v1/academy` that touches `training_days` inserts a row into `academy_schedules` with `effective_from = today` (idempotent on a same-day re-PATCH — the lookup is `(academy_id, effective_from)`). The `academies.training_days` column is updated in lockstep so existing readers that just want the "current" schedule keep working; the schedule-history table is the source of truth for historical reads. See [`academy-schedule.md`](./academy-schedule.md) for the read API. Both writers go through `App\Actions\Academy\RecordTrainingDaysAction`.
- **While the timetable has classes, `training_days` are derived from it (#1575).** The days are the weekdays with at least one [class](./academy-class.md); every class saved or deleted recomputes them through the same `RecordTrainingDaysAction`, so the history keeps its row. `PATCH /api/v1/academy` refuses `training_days` with a 422 in that state (`null` included) — a hand-set value would not stick — and so does `POST /api/v1/academy/schedules`; a pending future row is deleted when the timetable takes over. An academy with no classes keeps setting the days by hand, and removing the last class leaves the days where they were: a timetable taken down is not a claim that nobody trains.
- **The season is a window, and the roster measures against it (#1484).** `App\Support\Season::startFor()` resolves `season_start_month` against a given moment: a date before this year's boundary belongs to the season that opened the *previous* year, so 15 March 2026 sits in the season that began 1 September 2025. `GET /api/v1/athletes` scopes `attendance_total_count` to that window, floored per row at the athlete's own `joined_at` — someone who joined in November cannot have attended September's sessions, and counting them against the whole season reports the academy's calendar as if it were their record. The resource returns the resolved `season_start` and `season_label` alongside the raw month so the SPA never re-derives the boundary.
- **A month before the academy adopted Budojo is not an unpaid month (#1742).** `billing_from` says when this academy started recording fees here. Below it, a missing `athlete_payments` row means the money was handled somewhere else — the ledger renders those months as out of scope (a neutral em-dash) rather than amber "unpaid". An academy that trained for years before the app otherwise showed up to six seasons of phantom arrears per athlete, and any academy-wide arrears figure would sum exactly those cells.
  - **The effective floor is `max(billing_from, the athlete's joined_at)`**, resolved in `App\Support\BillingFloor` and emitted as `billing_floor` on `AthleteResource`. One rule, one place — the same argument `MonthCoverage` makes: the roster, the athlete's ledger and every arrears figure built later all ask this question, and a second implementation is a second answer. A per-athlete override, if it is ever asked for, is a change to that class and nothing else.
  - **It is a display and aggregation rule, not a write rule.** `POST /athletes/{id}/payments` still accepts a month below the floor — an owner transcribing a paper register is exactly the case that produces one. The server's `min:2020` on that request is the separate, harder floor and the two must not be collapsed.
  - **The day is always the 1st.** The form offers a month; `UpdateAcademyAction` pins whatever arrives, so a floor set on the 17th cannot behave differently from one set on the 1st.
  - **Null is no floor**, never "since forever".
- **The SPA's `/dashboard` routes are guarded by `hasAcademyGuard`.** A logged-in user without an academy is redirected to `/setup`. A user with an academy trying to visit `/setup` is redirected to `/dashboard`.
- **Academy-scoping on every authenticated request** is handled in the controllers, not in a policy or model scope — we match the Athlete pattern. `StoreAthleteRequest::authorize()` and similar check `$user->academy !== null`; the controller then uses `$user->academy->id` to filter queries.
- **No soft-delete.** Deleting a user cascades to their academy which cascades to their athletes.

## Related endpoints

- `POST /api/v1/academy` — create (one-shot, 409 if the user already has one)
- `GET /api/v1/academy` — fetch the authenticated user's academy; returns 404 if none (SPA uses this to detect first-login state)
- `PATCH /api/v1/academy` — partial update of `name`, `martial_art` (while unlocked), `address`, `monthly_fee_cents`, `carnet_price_cents`, `carnet_entries`, `carnet_entry_unit`, `training_days`, `season_start_month`, `billing_from`
- `POST /api/v1/academy/logo` — upload/replace logo
- `DELETE /api/v1/academy/logo` — remove logo
- `GET|POST /api/v1/academy/fee-tiers`, `PATCH|DELETE /api/v1/academy/fee-tiers/{tier}` — the monthly price list (#1381); see [`academy-fee-tier.md`](./academy-fee-tier.md)

## Related tables

- `users` — see [`user.md`](./user.md)
- `athletes` — see [`athlete.md`](./athlete.md)
