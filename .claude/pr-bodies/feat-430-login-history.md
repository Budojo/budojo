## What

Login-history audit log + a user-facing panel on `/dashboard/profile` (#430). The user can review the last 50 sign-in attempts (success + failure) on their account; a failed-login burst is the high-signal compromise event. Pairs with the active-sessions panel from #413: sessions covers LIVE Sanctum tokens, history covers PAST attempts including ones whose token has since been revoked or expired.

Closes #430.

## Why

Without history, a user who suspects compromise has only the "active sessions" view — which can't see attempts that no longer have a live token. A 90-day audit log gives them self-serve security awareness AND closes the natural extension of #413 ("the natural evolution with IP/geolocation").

## How

### Backend

- **Migration** `login_attempts` — `user_id` (nullable, fk users on cascade delete so a hard-deleted user takes their history with them), `email_attempted`, `ip_address` (varchar 45 for IPv6), `user_agent` (varchar 1024), `success` bool, `created_at` only (logs are immutable). Composite index on `(user_id, created_at)` for the per-user list query.
- **`LoginAttempt`** model (skinny — relations + casts only; an `Attribute` cast lowercases `email_attempted` at insert for a canonical audit shape).
- **`RecordLoginAttemptAction`** — append-only writer. Caps UA strings at 1024 chars defense-in-depth. Called from `LoginController` for EVERY attempt — success or failure — wrapped in try/report so an audit hiccup never blocks a legitimate login.
- **`LoginHistoryController::index`** exposing `GET /me/login-history` — last 50 rows, newest-first. UA parsed at read time via the existing `App\Support\UserAgentLabel` helper from #413 into the friendly device label.
- **`PurgeExpiredLoginAttempts`** Artisan command — `budojo:purge-expired-login-attempts`. 90-day retention, 5000-row cap per run, daily 03:00 Europe/Rome schedule via `routes/console.php`. Same shape and discipline as the existing `purge-expired-*` crons.
- **12 PEST feature specs** cover login writes a row on success / wrong-password / unknown-email; lowercase email at insert; UA truncation at 1024; index endpoint orders newest-first + parses device + caps at 50 + cross-user isolation + auth required; cron deletes >90d rows + dry-run + no-op.

### Frontend

- **`ProfileLoginHistoryComponent`** rendered as a card section on `/dashboard/profile`, immediately below the active-sessions panel. Loading / list / error / empty states. Failed rows carry a subtle red wash + a "failed" pill so a failed-login burst stands out at a glance. Footer hint surfaces the "if unfamiliar, change password" CTA when at least one row is visible.
- **`LoginHistoryService`** with `list()` against the backend. Uses `environment.apiBase` for parity.
- **i18n** — EN + IT keys under `profile.loginHistory.*`. Parity test green.
- **5 vitest specs** cover loading / list-with-failed-pill / empty / error / null-IP no leakage.
- **2 cypress E2E specs** for the populated and empty states.

### Privacy posture

- **Privacy policy** (it markdown + EN/IT SPA components) updated § 4 Retention to disclose the new `login_attempts` table, the 90-day retention window, and the user-facing panel.
- IP storage already covered by the existing "Metadati tecnici" row in the DPA template's data-categories block under GDPR Art. 6(1)(f) legitimate interest in security and audit. **No DPA template change required.**

### OpenAPI

- New path `GET /me/login-history` documenting row shape, auth, and the privacy / retention rationale. Spectral **0 errors** (the 6 warnings are pre-existing tag/component noise).

## Out of scope

- IP → country / "approximate location" lookup. Adds a third-party geolocation provider (additional sub-processor) which is a privacy escalation we can revisit when there's traction. The IP is shown raw for now.
- Pagination / "load more" beyond the 50-row cap. The retention is 90 days; 50 is generous given that window. Easy to add later without a schema change.
- Failed-burst alerting (email the user on N consecutive failures within M minutes). Tracked under #429 audit log umbrella.

## References

- #430 — this issue
- #413 — sister issue (active sessions list); same `UserAgentLabel` helper, same panel chrome
- DPIA / privacy policy precedents in #533, #535, #539

## Test plan

- [x] PHPStan clean
- [x] PEST scope green (118 specs, 392 assertions in the auth + sessions + login-history + UA-helper families)
- [x] Vitest 746 specs green (5 new in `profile-login-history.component.spec.ts`)
- [x] Cypress E2E 2 new specs (in CI)
- [x] Spectral OpenAPI 0 errors
- [x] EN/IT i18n parity
- [ ] Manual smoke after deploy: log in, see the row appear in `/dashboard/profile` § Login history; attempt a wrong password from another tab, see the failed row with the red wash; verify the privacy policy update at `/privacy` and `/privacy/it`
