## What

Active sessions panel on `/dashboard/profile` (#413) — lists every Sanctum personal-access-token tied to the user with a per-row revoke action and a "Sign out other sessions" CTA at the top. Closes #413.

## Why

Sanctum already mints a token per login (`personal_access_tokens` since #21), so the data to surface "where am I logged in" exists. Without this UI, a user who suspects compromise on another device could only change their password and hope.

## How

### Backend

- **`UserAgentLabel` helper** (`server/app/Support`) — coarse human-readable device label (`Chrome on macOS`, `Safari on iOS`, `Unknown device`) parsed from the `User-Agent` header. No external dep — eight `str_contains()` checks against the seven browser / four OS combinations we ship to today, length-capped at 80 chars defense-in-depth. Edge / Firefox / Chrome / Safari × macOS / Windows / iOS / Android / Linux.
- **Token names on creation** — `LoginController`, `RegisterController`, `AcceptAthleteInvitationAction` now pass the device label as the token name (was hardcoded `auth` / `athlete-invite-accept`). The Action's `execute()` signature gains an optional `$deviceLabel` so CLI / test paths stay backward-compatible.
- **`SessionController`** with three endpoints:
  - `GET /me/sessions` — list every PAT, newest `COALESCE(last_used_at, created_at) DESC` first; each row carries an `is_current` flag stamped on the token authenticating THIS request.
  - `DELETE /me/sessions/{id}` — revoke a single PAT. 204 success, 404 on cross-user / never-existed / non-numeric (route binding pins `{id}` to digits). Same shape for all 404 cases — no enumeration leak.
  - `DELETE /me/sessions` — revoke every other PAT, keep current. Returns `{data: {revoked: count}}`.
- All three routes inside `auth:sanctum` group. `currentAccessToken()` narrowed via `instanceof PersonalAccessToken` because the runtime can return `PersonalAccessToken` (real Bearer) OR `TransientToken` (test paths via `actingAs`). Sanctum's `@return TToken` annotation is misleading at runtime — handled with a localized `@phpstan-ignore-next-line`.
- 12 PEST feature specs cover index ordering, is_current marker, cross-user isolation, auth required, single-revoke, cross-user 404, non-existed 404, route-layer regex, revoke-self, revoke-all-others, no-others returns 0, cross-user no-touch.
- 11 PEST unit specs for `UserAgentLabel` cover the 7 browser / 4 OS combinations + empty fallback + unparseable fallback + length cap.

### Frontend

- **`ProfileSessionsComponent`** rendered as a card section on `/dashboard/profile`. Loading panel → list panel / error panel with retry CTA. Each row: device label + last-used-at (Angular `date: 'medium'`) + "this session" pill (when current) + per-row revoke button. Two-step UX on every destructive action via PrimeNG's `p-confirmpopup` — Krug § Forgiveness for mistakes.
- **`SessionService`** with `list() / revoke(id) / revokeOthers()` against the backend. Uses `environment.apiBase` for parity with the other core services.
- **i18n** — EN + IT keys under `profile.sessions.*`. Parity test green.
- **OpenAPI** — three new paths under `/me/sessions` and `/me/sessions/{id}` covering the wire shape, auth, and the same-shape 404 semantics. Spectral 0 errors.
- **9 vitest specs** cover loading / list / error / single-revoke (refresh + toast) / current-revoke (no refresh) / revoke-others / revoke-error / CTA visibility (with-and-without other sessions). Uses `TestBed.overrideComponent` to strip the component-level `ConfirmationService` provider so the spec can inject the same instance.
- **3 cypress E2E specs** for the list / single-revoke / revoke-others flows through the real p-confirmpopup interaction.

## Out of scope

- IP / geolocation / "approximate location" surfacing — Sanctum's `personal_access_tokens` doesn't track this and persistence adds GDPR-flavored complications. Out of scope today; tracked in #430 (login history) which IS planned to surface this.
- Backfill of older `auth` / `athlete-invite-accept` token names. Not worth a one-shot migration; new logins re-mint with the friendly label and old tokens age out naturally.
- Per-token scopes (`abilities`) — Budojo doesn't use scoped tokens yet, every token mints with `*`. The Resource skips the column.

## References

- #413 — this issue
- `server/database/migrations/2026_04_21_144237_create_personal_access_tokens_table.php` — Sanctum's table; no schema change needed
- #430 — login history (planned future work that DOES need IP / location)

## Test plan

- [x] PHPStan clean
- [x] PEST sessions + UA + auth regressions green (104 specs, 346 assertions)
- [x] Vitest 741 specs green (9 new in `profile-sessions.component.spec.ts`)
- [x] Cypress E2E 3 specs green (in CI)
- [x] Spectral OpenAPI 0 errors
- [x] EN/IT i18n parity
- [ ] Manual smoke after deploy: `/dashboard/profile` lists at least the current session, "this session" pill is on the right row, revoke + revoke-others fire confirm popups, post-revoke list refreshes
