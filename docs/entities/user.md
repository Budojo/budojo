# Entity — `User`

## Purpose

A `User` is an authenticated identity in Budojo. Two personas exist, distinguished by the `role` enum (#445):

- **`owner`** — the academy owner / manager. Created via the public `POST /api/v1/auth/register` endpoint. Owns at most one academy (see the `academies.user_id` unique constraint).
- **`athlete`** — an athlete linked to a roster row through the M7 invite flow. Created exclusively via `POST /api/v1/athlete-invite/{token}/accept`; there is NO public path to becoming an athlete. The link to the roster row lives on `athletes.user_id` and is consumed via `User::athlete()` (HasOne).

Every authenticated request in the system is made on behalf of a single user. The concept of staff (a user that is neither owner nor athlete, e.g. a coach) is explicitly deferred to future milestones — the enum is intentionally a string column, not native MySQL `ENUM(...)`, so a future case lands without an `ALTER TABLE`.

## Schema — `users`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `first_name` | string | not null, default `''` | Given name (#479). Default `''` covers the migration backfill; never lands from a validated request. |
| `last_name` | string | not null, default `''` | Family name (#479). May legitimately be empty for a single-token migrated row. |
| `handle` | string(30) | nullable, **unique** | Instagram-style user-chosen handle (#479). Lowercase `[a-z0-9_.]`, 3-30 chars, must start with a letter, no consecutive dots, no leading/trailing dot. Lowercased on save (the unique index is therefore effectively case-insensitive). Null until the user opts in via the profile page. |
| `email` | string | not null, **unique** | Login credential and contact email |
| `email_verified_at` | timestamp | nullable | Set when the user clicks the M5 verification link issued at `POST /auth/register`. Also stamped by `AcceptAthleteInvitationAction` (#445 — the invite token IS the email proof) and re-stamped by `ConfirmEmailChangeAction` (#476 — the verification click on the new address). Null until a flow above runs. |
| `terms_accepted_at` | timestamp | nullable | Set on `POST /auth/register` when the user ticks the Terms-of-Service gate (#420). Null for pre-#420 accounts and any future system-only user creation path. |
| `avatar_path` | string | nullable | Relative path on the `public` disk of the uploaded avatar (#411). Null until the first `POST /me/avatar`. The wire layer emits `avatar_url` (full URL) via `UserResource`, never the raw path. |
| `password` | string | not null | Bcrypt hash (cost 12, configured via `BCRYPT_ROUNDS`) |
| `role` | string(32) | not null, default `'owner'` | Persona discriminator (#445). One of `owner` / `athlete` (the `App\Enums\UserRole` PHP enum). Cast as enum on the model. Backfilled to `owner` for every pre-M7 row. Public `/auth/register` ALWAYS produces `owner`; `athlete` is only set through `AcceptAthleteInvitationAction` (M7 PR-C). |
| `two_factor_secret` | text | nullable, **encrypted** | Base32-encoded TOTP secret (#412). Set on `POST /me/two-factor/enrol`, wiped on `DELETE /me/two-factor`. The Eloquent `encrypted` cast wraps the value at-rest; even a DB dump leak doesn't yield usable TOTP secrets without the app key. Text (not varchar) because encryption inflates the byte count beyond varchar 255. |
| `two_factor_recovery_codes` | text | nullable, **encrypted** | JSON array of 8 single-use plaintext backup codes (#412), `XXXX-XXXX` format. Consumed individually on a successful backup-code login (the array shortens by one). Regenerated en bloc via `POST /me/two-factor/recovery-codes/regenerate`. Same encrypted-at-rest contract as `two_factor_secret`. |
| `two_factor_confirmed_at` | timestamp | nullable | Set when the user completes step 2 of enrolment (`POST /me/two-factor/confirm` with a valid TOTP) (#412). The load-bearing "is 2FA active?" check — null means 2FA is OFF even when a partial-enrolment secret happens to sit in `two_factor_secret`. |
| `remember_token` | string(100) | nullable | Laravel "remember me" token — unused by the SPA auth flow but kept for compatibility |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `hasOne(Academy::class)` — the academy owned by this user. Nullable (a user may exist without an academy in the first-login window, which triggers the `/setup` SPA flow via `noAcademyGuard`). For `role=athlete` users this is always null.
- `hasOne(Athlete::class)` — the athlete row this user is linked to (M7, #445). Reads `athletes.user_id`; non-null only for `role=athlete` users that have completed the invite-accept flow. For owners this is always null.
- `hasMany(PersonalAccessToken::class)` — issued via `Laravel\Sanctum\HasApiTokens`. Tokens are stored in `personal_access_tokens` as a polymorphic relation.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(email)` — enforces one account per email address
- `UNIQUE(handle)` — enforces one account per Instagram-style handle (#479). Storage is lowercased on every write, so the index is effectively case-insensitive.

## Business rules

- **Email uniqueness is global**, not scoped. Two academies cannot share an owner's email.
- **Handle uniqueness is global** (#479) — same shape as email. The `App\Rules\HandleFormat` rule mirrors the front-end regex so the SPA preview matches the server-accepted shape. The handle is OPTIONAL in V1: NULL is the default, and existing accounts stay NULL through the migration. The user opts in via the profile page; mention/lookup surfaces consume the column in follow-up issues.
- **Name shape** (#479) — `first_name` + `last_name` are the canonical structured fields. Surfaces that want one string consume the `full_name` accessor (`UserResource.full_name`, `User->full_name` in PHP) which is `trim(first_name . ' ' . last_name)`. Greeting contexts (welcome mail, "Hi X" lines) prefer `first_name` directly.
- **Registration flow** (`POST /api/v1/auth/register`) creates the user without an academy. The SPA routes newly-registered users to `/setup` via the `noAcademyGuard`. Handle is NOT collected at registration — post-signup self-service.
- **Password hashing** is handled by Laravel's `hashed` cast — callers pass plaintext and the framework hashes before insert.
- **Password breach check** (#415). Every entry point that lets the user pick or change a password (`POST /api/v1/auth/register`, `POST /api/v1/auth/password/reset`, `POST /api/v1/me/password`, `POST /api/v1/athlete-invite/{token}/accept`) runs `App\Rules\PasswordNotBreached`, which queries the [HaveIBeenPwned k-anonymity API](https://haveibeenpwned.com/API/v3#PwnedPasswords) — sends only the first 5 chars of the SHA-1 hash, never the password. A match returns 422 with `errors.password: ['password_breached']`. The check is **soft-fail** on upstream outage: if HIBP is unreachable, the user is allowed through (better than outaging signup). Per-prefix bucket responses are cached for 24h to amortize traffic across users.
- **No soft-delete** on users. Deleting a user cascades to their academy (which cascades to athletes) via FK cascade.
- **Sanctum tokens** issued at login do not expire by default — `expires_at` in `personal_access_tokens` is null. There is no `/api/v1/auth/logout` endpoint today; "logout" in the SPA is client-side only (drops the token from `localStorage`) and does **not** revoke the row in `personal_access_tokens`. Adding a server-side revoke endpoint is queued for a future PR.
- **Terms of Service acceptance** (#420). The registration form carries a `Validators.requiredTrue` checkbox; the server's `RegisterRequest` enforces it via Laravel's `accepted` rule. On success `RegisterUserAction` writes `terms_accepted_at = now()` on the user row. The acceptance is recorded once, at signup; versioned ToS with re-acceptance is explicitly out of scope for this milestone. The full ToS text lives at the public `/terms` SPA route. Mirrors the privacy-policy gate (#219) but stays a separate column so legal review can audit each consent independently.
- **Avatar lifecycle** (#411). Uploaded via `POST /api/v1/me/avatar` (multipart, `image` rule + `mimes:jpeg,jpg,png,webp`, max 2 MB). `UploadAvatarAction` stores the original bytes at `users/avatars/{user-id}.{ext}` on the `public` disk (no server-side resize — the SPA renders the avatar inside a fixed circular frame via CSS `object-fit`, which is honest about what's on disk and avoids depending on GD encoders that aren't compiled into the API container). Same-extension replacements overwrite in place; different-extension replacements unlink the orphan from the previous upload. `DELETE /api/v1/me/avatar` unlinks the file and clears `avatar_path`; idempotent (deleting a missing avatar still returns 200 with `avatar_url: null`). The `avatar_url` exposed via `UserResource` carries a `?v={updated_at-timestamp}` cache-buster so a same-path replace forces the browser to fetch the new bitmap. SVG is intentionally rejected on this surface — the academy-logo flow needed a hand-rolled sanitiser, and head-shots don't justify that surface area. The GDPR-purge path (`PurgeAccountAction`) deletes the avatar from the `public` disk before unlinking the user row.
- **TOTP two-factor authentication** (#412). When `two_factor_confirmed_at` is non-null the login flow demands a `two_factor_code` body field — a 6-digit TOTP from an authenticator app, or one of the single-use backup codes in `two_factor_recovery_codes`. A successful backup-code login consumes the code (removes it from the array); the SPA prompts the user to regenerate before the array empties. Disabling 2FA (`DELETE /me/two-factor`) requires the current password as a re-auth gate — defense in depth so a stolen session cannot strip 2FA without the password. Both `two_factor_secret` and `two_factor_recovery_codes` are encrypted at-rest via Eloquent's `encrypted` / `encrypted:array` casts; `two_factor_secret` and `two_factor_recovery_codes` are also marked `$hidden` on the `User` model so they never leak through API resources or `auth/me` responses.
- **In-app password rotation** (#409). `POST /api/v1/me/password` rotates the password while keeping the user logged in. The request requires `current_password` (Hash::check re-auth gate), `password`, and `password_confirmation`; the new password must satisfy the registration policy (`min:8` + `confirmed`) AND differ from the current one. On success every Sanctum personal-access-token row belonging to the user is deleted EXCEPT the one used for the request — defence-in-depth against a hijacked session without yanking the legitimate user's active tab. Mirrors `RegisterRequest` / `ResetPasswordRequest` rules so a rotation cannot weaken the registration policy.

## Related endpoints

- `POST /api/v1/auth/register` — creates a user
- `POST /api/v1/auth/login` — returns a bearer token for this user
- `POST /api/v1/me/avatar` — upload or replace the user's avatar (#411)
- `DELETE /api/v1/me/avatar` — remove the user's avatar (#411)
- `POST /api/v1/me/password` — rotates the password in-app; revokes other Sanctum tokens (#409)
- `GET /api/v1/me/two-factor` — current 2FA enrolment state (#412)
- `POST /api/v1/me/two-factor/enrol` — mint a TOTP secret, return provisioning URI (#412)
- `POST /api/v1/me/two-factor/confirm` — confirm enrolment with a TOTP, return 8 backup codes (#412)
- `POST /api/v1/me/two-factor/recovery-codes/regenerate` — regenerate 8 backup codes (#412)
- `DELETE /api/v1/me/two-factor` — disable 2FA, requires current password (#412)
- `GET /api/v1/health` — public, no user involved

## Related tables

- `personal_access_tokens` — see [`personal-access-token.md`](./personal-access-token.md)
- `password_reset_tokens` — Laravel default, written by `Password::sendResetLink()` from the M5 PR-A forgot-password flow. One row per outstanding reset request; the row is deleted on successful `Password::reset()` consumption (one-shot tokens) or expires 60 minutes after issuance.
- `sessions` — Laravel default, used only for the web session driver; the API is stateless so this is empty in normal operation
