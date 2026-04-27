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
| `name` | string | not null | Human-readable name of the token. Currently always `"auth"` (set by `LoginController` and `RegisterController` via `$user->createToken('auth')`). Free-text — future endpoints may differentiate per device |
| `token` | string(64) | **unique**, not null | SHA-256 hash of the plaintext token — the plaintext is returned once at issue time and never stored |
| `abilities` | text | nullable | JSON array of granted abilities; `["*"]` means all. Budojo does not currently scope abilities |
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

## Business rules

- **Token plaintext is returned once**, in the `token` field of the `/auth/login` and `/auth/register` responses. The DB stores only the hash. If lost, the user must re-login.
- **No expiry enforcement today**. Budojo issues tokens with `expires_at = null`. Moving to short-lived tokens + refresh is not planned for M1–M6.
- **Abilities are always `["*"]`** — no per-token ability scoping yet.
- **No server-side logout today.** There is no `/api/v1/auth/logout` endpoint. The Angular SPA "logs out" by removing the token from `localStorage` — the row in `personal_access_tokens` remains in the DB. Adding a revoke endpoint is tracked as a fast follow.
- **Token name is always `"auth"`** for tokens issued by `LoginController` and `RegisterController`. There is no per-device naming yet — an authenticated user logging in from two devices has two rows both named `"auth"`.

## Related endpoints

- `POST /api/v1/auth/login` — issues a token
- `POST /api/v1/auth/register` — issues a token
- _(planned)_ `POST /api/v1/auth/logout` — not yet implemented. Today the SPA discards the token client-side without server notification

## Related tables

- `users` — see [`user.md`](./user.md)
