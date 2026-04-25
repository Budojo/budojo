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

- **Creation is one-shot.** `POST /api/v1/academy` is the only write endpoint. There is no PATCH or DELETE today. If the owner wants to rename, we would add a separate endpoint — not planned before M6.
- **Slug is server-generated, not user-supplied.** The shape is `slugified(name) + '-' + 8 lowercase random chars`, e.g. `gracie-barra-lisboa-a3f9kx2b`. This guarantees uniqueness without exposing collision logic to the user.
- **The SPA's `/dashboard` routes are guarded by `hasAcademyGuard`.** A logged-in user without an academy is redirected to `/setup`. A user with an academy trying to visit `/setup` is redirected to `/dashboard`.
- **Academy-scoping on every authenticated request** is handled in the controllers, not in a policy or model scope — we match the Athlete pattern. `StoreAthleteRequest::authorize()` and similar check `$user->academy !== null`; the controller then uses `$user->academy->id` to filter queries.
- **No soft-delete.** Deleting a user cascades to their academy which cascades to their athletes.

## Related endpoints

- `POST /api/v1/academy` — create (one-shot, fails if the user already has one)
- `GET /api/v1/academy` — fetch the authenticated user's academy; returns 404 if none, which the SPA uses to detect first-login state

## Related tables

- `users` — see [`user.md`](./user.md)
- `athletes` — see [`athlete.md`](./athlete.md)
