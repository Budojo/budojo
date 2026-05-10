## What

Promotes the `develop` branch to `main`, triggering semantic-release to tag **v2.5.0** (minor bump driven by the four `feat:` commits from #557, #558, #559, #560) and publish a stable GitHub Release.

## Headline

A "security & notifications center" on the user's profile page. Four new sections, all on `/dashboard/profile`:

1. **One-click cancel of a scheduled account deletion** (#557, closes #545). The deletion-confirmation email now carries a "Cancel deletion" button that lands the user on a public SPA page (`/account/deletion-cancel/:token`). The page POSTs the one-time token to a public, unauthenticated API endpoint that deletes the `pending_deletions` row, restoring the account. The token is constrained at the route level to `[A-Za-z0-9]{64}` so a malformed link 404s before the controller fires; same-shape `cancelled: false` response on already-clicked / never-valid / already-purged so we don't leak which case the user is in. Token is auto-stripped from the URL via `history.replaceState` post-consume so it doesn't leak via screenshots, browser history, or `Referer` headers. Server-side delete is gated on `scheduled_for > now()` so a click after the grace window has elapsed cannot resurrect the account.

2. **Active sessions list with per-token revoke** (#558, closes #413). New panel on `/dashboard/profile` lists every Sanctum personal-access-token tied to the user, sorted by `COALESCE(last_used_at, created_at) DESC`. Each row carries a friendly device label (`Chrome on macOS`, `Safari on iOS`, `Unknown device`) parsed from the User-Agent at token-creation time by the new `App\Support\UserAgentLabel` helper, plus an `is_current` flag stamped on the row that authenticated the page. Per-row "Revoke" + a top-level "Sign out other sessions" CTA, both with `p-confirmpopup` confirmations on the actual button host (`event.currentTarget`). The user can revoke their current session — the next request bounces on 401 and the auth interceptor handles the sign-out. Three new endpoints under `/me/sessions{,/{id}}` with route-binding regex on `{id}` and same-shape 404 across cross-user / never-existed / non-numeric. `LoginController` / `RegisterController` / `AcceptAthleteInvitationAction` now mint tokens with the friendly device label as the token name (was hardcoded `auth` / `athlete-invite-accept`).

3. **Login history audit log** (#559, closes #430). Read-only audit log of every authentication attempt — successful AND failed — with a panel on `/dashboard/profile` showing the last 50 rows newest-first. Failed rows carry a subtle red wash + a "failed" pill so a failed-login burst from a stranger stands out at a glance. Wrong-password attempts on existing accounts are attributed to the matched `user_id` (the 401 response stays unchanged so this is NOT a leak) so the user actually sees the failed attempt in their own history — that's the load-bearing UX of the feature. New `login_attempts` table with composite index `(user_id, created_at)` for the per-user list query AND a standalone `created_at` index for the daily retention cron. New `budojo:purge-expired-login-attempts` Artisan command runs daily at 03:00 Europe/Rome with a 5000-row cap and 90-day retention; the privacy policy at `/privacy` § 4 has been updated to disclose the retention window.

4. **Per-category email notification preferences** (#560, closes #416). New panel on `/dashboard/profile` lets the user toggle the digest / reminder categories independently (`medical_cert_expiry_reminders`, `unpaid_athletes_digest`). Transactional emails (`welcome`, `password_reset`, `email_verification`, `account_deletion`, `athlete_invitation`) are listed in a read-only "always sent" block — never gated, can't be opt-out. Optimistic local update on toggle: switch flips immediately, PATCH fires in the background, snapshot from the response refreshes state. On rare failure the switch reverts and an error toast surfaces. New `users.notification_preferences` JSON column with default-opt-in semantics (null / absent key → enabled). The `SendMedicalCertExpiryReminders` and `SendUnpaidAthletesDigest` Artisan commands now consult `App\Support\NotificationPreferences::isEnabled` before queueing per academy. New `App\Support\NotificationCategory` catalog as the single source of truth for the toggleable category strings; `Rule::array($catalog)` validates the PATCH body against the catalog so an unknown key surfaces 422 with the offending key named.

## What's New

User-facing changelog entry pre-staged in #561 — markdown at `docs/changelog/user-facing/v2.5.0.md`, typed `Release[]` entry prepended in `whats-new.component.ts`, vitest order-pin (27 → 28 cards, latest = `v2.5.0`) and Cypress visibility spec updated in lock-step. The page at `/dashboard/whats-new` will render v2.5.0 as the top card the moment this PR lands.

## Closes

- #413 — active sessions list with per-token revoke
- #416 — email notification preferences (per-category opt-out)
- #430 — login history visible to the user
- #545 — email-link cancel flow for pending account deletion

Follow-up issues opened during this cycle remain open by design:

- #417 — unsubscribe links + List-Unsubscribe headers (depends on the preferences column from #416; separate PR will add the email footer)

## Privacy posture

- Privacy policy (markdown + EN/IT SPA components) updated § 4 Retention to disclose `login_attempts` (timestamp, IP, user-agent, success/failure) with 90-day retention.
- IP storage justified by GDPR Art. 6 (1) (f) legitimate interest in security and audit. Already covered by the existing "Metadati tecnici" row in the DPA template's data-categories block — no DPA change required.

## Merge style

**Merge commit** — NOT squash. The release flow needs the develop→main merge commit so `main` carries the full history; squashing breaks the post-release `main → develop` sync sweep's bookkeeping. (See `project_release_merge_style.md` agent-side memory + the Auto-sweep section of the root `CLAUDE.md`.)
