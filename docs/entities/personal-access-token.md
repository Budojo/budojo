# Entity — `PersonalAccessToken` (Sanctum)

## Purpose

A `PersonalAccessToken` row is a **Bearer token** issued to an authenticated `User` by Laravel Sanctum. The Angular SPA obtains one on login/register (`POST /api/v1/auth/login` or `/auth/register`) and attaches it as `Authorization: Bearer <token>` on every subsequent request via the functional `authInterceptor` in `core/interceptors/auth.interceptor.ts`. Budojo does not use cookie-based Sanctum — purely stateless Bearer.

## Schema — `personal_access_tokens`

Created by Sanctum's default migration; unchanged.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `tokenable_type` | string | morph type | Always `App\Models\User` today — Sanctum uses a polymorphic relation |
| `tokenable_id` | bigint unsigned | morph id | FK to `users.id` |
| `name` | string | not null | Human-readable label. For `kind = 'session'` tokens it's a device label derived from User-Agent (#413, e.g. `"Chrome on macOS"`, `"Safari on iOS"`, `"Unknown device"`). For `kind = 'api'` tokens it's the user-chosen name supplied at creation (#431, e.g. `"nightly-export-script"`). |
| `kind` | string(16) | not null, default `'session'`, **indexed** | Token-population discriminator (#431). `'session'` rows are browser/mobile login tokens surfaced on `/me/sessions`; `'api'` rows are long-lived user-minted integration tokens surfaced on `/me/api-tokens`. Pre-#431 rows were backfilled to `'session'`. Open for extension — a future `'webhook'` (#432) or `'oauth'` value lands without an `ALTER TABLE`. |
| `token` | string(64) | **unique**, not null | SHA-256 hash of the plaintext token — the plaintext is returned once at issue time and never stored |
| `abilities` | text | nullable | JSON array of granted abilities. `kind = 'session'` tokens carry `["*"]` (wildcard, backwards-compat for every Sanctum-guarded endpoint). `kind = 'api'` tokens carry a user-picked subset from `App\Support\ApiTokenAbility::all()` (`athletes:read`, `documents:write`, etc.). |
| `last_used_at` | timestamp | nullable | Updated by Sanctum middleware on every authenticated request |
| `expires_at` | timestamp | nullable, **indexed** | When the token expires; null = never expires (Budojo default today) |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Relations

- `morphTo('tokenable')` — in Budojo, always points to a `User`

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(token)` — enforces token uniqueness across the entire system
- `INDEX(tokenable_type, tokenable_id)` — fast lookup of all tokens for a given user (used on logout-all)
- `INDEX(expires_at)` — prepared for a future expired-token cleanup job
- `INDEX(kind)` (#431) — both `/me/sessions` and `/me/api-tokens` scope their queries by `kind`, so the index keeps the per-surface read fast as the table grows.

## Business rules

- **Token plaintext is returned once**, in the `token` field of the `/auth/login` and `/auth/register` responses. The DB stores only the hash. If lost, the user must re-login.
- **Session-token expiry** stays `null` by default — browser tokens don't auto-expire; the user revokes them via `/me/sessions` (#413) or via the "Sign out other sessions" sweep.
- **API-token expiry** (#431) is user-controlled at creation: optional `expires_in_days` between 1 and 730. `null` means no expiry until the user explicitly revokes via `/me/api-tokens/{id}`.
- **Abilities** — session tokens carry `["*"]` (every Sanctum-guarded endpoint) for backwards compat. API tokens carry a user-picked non-empty subset from the catalog in `App\Support\ApiTokenAbility::all()`.
- **Plaintext returned once** — `auth/login` (session), `auth/register` (session), and `POST /me/api-tokens` (api) all return the plaintext bearer in the response body ONCE. The DB stores only the SHA-256 hash. Lost tokens are unrecoverable; the user generates a new one.
- **Surface-scoping discipline** (#431) — `/me/sessions` queries `WHERE kind = 'session'` and `/me/api-tokens` queries `WHERE kind = 'api'`. The `destroyOthers` "Sign out other sessions" sweep is ALSO scoped to `kind = 'session'` so it can't accidentally wipe an integration token.
- **Per-device session names** (#413) — `LoginController` derives the `name` from User-Agent via `App\Support\UserAgentLabel` (e.g. "Chrome on macOS"). Pre-#413 rows still carry the legacy `"auth"` / `"athlete-invite-accept"` strings; new logins re-mint with the friendly label automatically.

## Related endpoints

- `POST /api/v1/auth/login` — issues a session token (#413 + 2FA challenge in #412)
- `POST /api/v1/auth/register` — issues a session token
- `POST /api/v1/athlete-invite/{token}/accept` — issues a session token at the end of the invite-accept flow (#445)
- `GET /api/v1/me/sessions` — list session tokens (#413)
- `DELETE /api/v1/me/sessions/{id}` — revoke a session token (#413)
- `DELETE /api/v1/me/sessions` — revoke every OTHER session token (#413)
- `GET /api/v1/me/api-tokens` — list API tokens + abilities catalog (#431)
- `POST /api/v1/me/api-tokens` — mint an API token + return plaintext once (#431)
- `DELETE /api/v1/me/api-tokens/{id}` — revoke an API token (#431)

## Related tables

- `users` — see [`user.md`](./user.md)
