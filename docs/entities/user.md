# Entity — `User`

## Purpose

A `User` is the **owner** of a Budojo account and, transitively, of an `Academy`. Every authenticated request in the system is made on behalf of a single user. In the current v1, one user owns at most one academy (see the `academies.user_id` unique constraint). The concept of multi-academy owner, staff, or athlete login does not exist yet — it is explicitly deferred to future milestones.

## Schema — `users`

Laravel default structure, unchanged.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `name` | string | not null | Display name of the owner (e.g. "Mario Rossi") |
| `email` | string | not null, **unique** | Login credential and contact email |
| `email_verified_at` | timestamp | nullable | Reserved for future email verification flow; currently never set by the app |
| `password` | string | not null | Bcrypt hash (cost 12, configured via `BCRYPT_ROUNDS`) |
| `remember_token` | string(100) | nullable | Laravel "remember me" token — unused by the SPA auth flow but kept for compatibility |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `hasOne(Academy::class)` — the academy owned by this user. Nullable (a user may exist without an academy in the first-login window, which triggers the `/setup` SPA flow via `noAcademyGuard`).
- `hasMany(PersonalAccessToken::class)` — issued via `Laravel\Sanctum\HasApiTokens`. Tokens are stored in `personal_access_tokens` as a polymorphic relation.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(email)` — enforces one account per email address

## Business rules

- **Email uniqueness is global**, not scoped. Two academies cannot share an owner's email.
- **Registration flow** (`POST /api/v1/auth/register`) creates the user without an academy. The SPA routes newly-registered users to `/setup` via the `noAcademyGuard`.
- **Password hashing** is handled by Laravel's `hashed` cast — callers pass plaintext and the framework hashes before insert.
- **No soft-delete** on users. Deleting a user cascades to their academy (which cascades to athletes) via FK cascade.
- **Sanctum tokens** issued at login do not expire by default — `expires_at` in `personal_access_tokens` is null. There is no `/api/v1/auth/logout` endpoint today; "logout" in the SPA is client-side only (drops the token from `localStorage`) and does **not** revoke the row in `personal_access_tokens`. Adding a server-side revoke endpoint is queued for a future PR.

## Related endpoints

- `POST /api/v1/auth/register` — creates a user
- `POST /api/v1/auth/login` — returns a bearer token for this user
- `GET /api/v1/health` — public, no user involved

## Related tables

- `personal_access_tokens` — see [`personal-access-token.md`](./personal-access-token.md)
- `password_reset_tokens` — Laravel default, written by `Password::sendResetLink()` from the M5 PR-A forgot-password flow. One row per outstanding reset request; the row is deleted on successful `Password::reset()` consumption (one-shot tokens) or expires 60 minutes after issuance.
- `sessions` — Laravel default, used only for the web session driver; the API is stateless so this is empty in normal operation
