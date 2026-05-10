## What

A new "API tokens" panel on `/dashboard/profile` lets the user mint long-lived, user-named, abilities-scoped Sanctum tokens for integrations (a nightly roster-export script, automation hooks, etc.). The plaintext bearer is surfaced **once** on creation with a clear "save it now, you won't see it again" dialog.

## Why

Sanctum already powers session tokens on `personal_access_tokens` (#413 surfaced them on the active-sessions panel). There was no UI for the user to mint their own integration tokens. This closes that gap and is a foundation block for the outbound-webhooks story (#432).

## How

**Server (Laravel 13)**

- Migration adds a `kind` column to `personal_access_tokens` (default `'session'`; backfilled for every pre-existing row). The column is indexed because both surfaces query by it. Two populations now coexist in the same table:
  - `kind = 'session'` → `/me/sessions` (browser/mobile login tokens)
  - `kind = 'api'` → `/me/api-tokens` (this PR)
- `App\Support\ApiTokenAbility` — 8-entry catalog (`athletes/documents/payments/attendance` × `read/write`). Coarse-grained on purpose; finer granularity is deferred until a real third-party integration asks for it.
- `App\Http\Controllers\User\ApiTokenController` exposes 3 endpoints under `/api/v1/me/api-tokens`:
  - `GET` → list + abilities catalog in `meta`.
  - `POST` → mint; response includes the plaintext token once.
  - `DELETE /{id}` → revoke. 404 on cross-user ids; same shape as never-existed so the status code can't enumerate other users' ids.
- `SessionController.index/destroy/destroyOthers` all narrowed to `kind = 'session'` so a "revoke all other sessions" sweep can't wipe long-lived API tokens silently.

**Client (Angular 21 + PrimeNG 21)**

- `ApiTokenService` maps 1:1 to the 3 endpoints.
- `ProfileApiTokensComponent` — list/empty/error states with a "New token" CTA opening a dialog (name + abilities checkbox grid + optional `expires_in_days` 1-730 days). On success a **second** dialog surfaces the plaintext bearer with a copy button and an "I've saved it" acknowledgement gate (the user can't dismiss without confirming they've copied).
- Mounted right below the active-sessions panel — Krug § proximity, both surfaces manage tokens in this account.
- i18n full EN+IT lockstep.

**Docs**

- `docs/api/v1.yaml` — 3 new operations on `/me/api-tokens` with the full request/response shapes.

## Notes

- **Why a string `kind` not a boolean `is_api_token`?** Open-for-extension. A future `kind = 'webhook'` (for outbound-webhook delivery tokens, #432) or `kind = 'oauth'` lands without an `ALTER TABLE`.
- **Backwards compat** — every existing token row was a session token; the column default + backfill cover that. Token-creation sites (Login / Register / AthleteInvite-accept) don't need to set `kind` explicitly — the default 'session' fires at insert.
- **Wildcard abilities for sessions** — session tokens keep the `*` ability for backwards compat with every Sanctum-guarded endpoint today. Only `kind='api'` tokens are scoped against the catalog.

## Out of scope (per the issue body)

- Public API documentation portal (OpenAPI is the source today).
- OAuth2 / 3rd-party app flows.
- Per-team-member token quotas (depends on the multi-user umbrella).

## References

- Closes #431
- Related: #413 (active sessions surface), #432 (outbound webhooks — will reuse the `kind = 'webhook'` slot)

## Test plan

- [x] `vendor/bin/pest tests/Feature/ApiToken` — 10 specs green (35 assertions).
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [x] `npm test -- --watch=false` — 785 specs green (includes 3 new ApiTokenService specs).
- [x] `npm run lint` — clean.
- [ ] Cypress E2E spec — deferred; the SPA dialogs ship today, an end-to-end mint/copy/revoke flow lands in a follow-up so this PR stays focused.
- [ ] Manual smoke on /dashboard/profile: list empty → New token dialog → abilities checkbox grid → plaintext dialog with copy.
