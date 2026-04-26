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
| `address` | string(500) | nullable | Free-text postal address — optional at setup time |
| `logo_path` | string(255) | nullable | Relative path on the `public` disk; absent until the owner uploads a logo. The API resource resolves it to a public `logo_url` via `Storage::disk('public')->url(...)` |
| `monthly_fee_cents` | unsigned int | nullable | Academy-wide membership fee, **stored in cents** to avoid float pitfalls (€95.00 = `9500`). `null` means "fee not configured" — the payments endpoints reject `POST` with 422 until the owner sets it. Settable via `PATCH /api/v1/academy` |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `belongsTo(User::class, 'user_id')` — exposed as the `owner()` method
- `hasMany(Athlete::class)` — all athletes in this academy

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(user_id)` — enforces one-academy-per-user
- `UNIQUE(slug)` — enforces URL uniqueness

## Business rules

- **Creation is one-shot.** `POST /api/v1/academy` fails with 409 if the owner already has one — only one academy per user, ever.
- **`name`, `address`, `logo_path`, and `monthly_fee_cents` are mutable** via `PATCH /api/v1/academy` (and the dedicated `/academy/logo` endpoints for the logo file). `slug` is intentionally immutable — renames keep the original permalink stable.
- **Slug is server-generated, not user-supplied.** The shape is `slugified(name) + '-' + 8 lowercase random chars`, e.g. `gracie-barra-lisboa-a3f9kx2b`. This guarantees uniqueness without exposing collision logic to the user.
- **`monthly_fee_cents` snapshots into payment rows.** When `RecordAthletePaymentAction` records a payment, it copies the academy's *current* `monthly_fee_cents` into `athlete_payments.amount_cents`. Future fee changes therefore do NOT rewrite past payment history.
- **The SPA's `/dashboard` routes are guarded by `hasAcademyGuard`.** A logged-in user without an academy is redirected to `/setup`. A user with an academy trying to visit `/setup` is redirected to `/dashboard`.
- **Academy-scoping on every authenticated request** is handled in the controllers, not in a policy or model scope — we match the Athlete pattern. `StoreAthleteRequest::authorize()` and similar check `$user->academy !== null`; the controller then uses `$user->academy->id` to filter queries.
- **No soft-delete.** Deleting a user cascades to their academy which cascades to their athletes.

## Related endpoints

- `POST /api/v1/academy` — create (one-shot, 409 if the user already has one)
- `GET /api/v1/academy` — fetch the authenticated user's academy; returns 404 if none (SPA uses this to detect first-login state)
- `PATCH /api/v1/academy` — partial update of `name`, `address`, `monthly_fee_cents`
- `POST /api/v1/academy/logo` — upload/replace logo
- `DELETE /api/v1/academy/logo` — remove logo

## Related tables

- `users` — see [`user.md`](./user.md)
- `athletes` — see [`athlete.md`](./athlete.md)
