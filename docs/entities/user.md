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
| `terms_accepted_at` | timestamp | nullable | Set on `POST /auth/register` when the user ticks the Terms-of-Service gate (#420). Null for pre-#420 accounts and any future system-only user creation path. |
| `avatar_path` | string | nullable | Relative path on the `public` disk of the uploaded avatar (#411). Null until the first `POST /me/avatar`. The wire layer emits `avatar_url` (full URL) via `UserResource`, never the raw path. |
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
- **Terms of Service acceptance** (#420). The registration form carries a `Validators.requiredTrue` checkbox; the server's `RegisterRequest` enforces it via Laravel's `accepted` rule. On success `RegisterUserAction` writes `terms_accepted_at = now()` on the user row. The acceptance is recorded once, at signup; versioned ToS with re-acceptance is explicitly out of scope for this milestone. The full ToS text lives at the public `/terms` SPA route. Mirrors the privacy-policy gate (#219) but stays a separate column so legal review can audit each consent independently.
- **Avatar lifecycle** (#411). Uploaded via `POST /api/v1/me/avatar` (multipart, `image` rule + `mimes:jpeg,jpg,png,webp`, max 2 MB). The `UploadAvatarAction` re-encodes through GD to a 256x256 center-cropped JPEG and stores it at `users/avatars/{user-id}.jpg` on the `public` disk. The deterministic path means a replace overwrites in place — no orphan file from the previous upload. `DELETE /api/v1/me/avatar` unlinks the file and clears `avatar_path`; idempotent (deleting a missing avatar still returns 200 with `avatar_url: null`). SVG is intentionally rejected on this surface — the academy-logo flow needed a hand-rolled sanitiser, and head-shots don't justify that surface area. User soft-delete doesn't exist, so there's no soft-delete unlink hook today; if it lands later the cleanup needs a matching delete on the `public` disk.

## Related endpoints

- `POST /api/v1/auth/register` — creates a user
- `POST /api/v1/auth/login` — returns a bearer token for this user
- `POST /api/v1/me/avatar` — upload or replace the user's avatar (#411)
- `DELETE /api/v1/me/avatar` — remove the user's avatar (#411)
- `GET /api/v1/health` — public, no user involved

## Related tables

- `personal_access_tokens` — see [`personal-access-token.md`](./personal-access-token.md)
- `password_reset_tokens` — Laravel default, written by `Password::sendResetLink()` from the M5 PR-A forgot-password flow. One row per outstanding reset request; the row is deleted on successful `Password::reset()` consumption (one-shot tokens) or expires 60 minutes after issuance.
- `sessions` — Laravel default, used only for the web session driver; the API is stateless so this is empty in normal operation
