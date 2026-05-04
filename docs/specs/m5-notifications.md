# M5 — Email infrastructure & notifications (PRD)

> Status: **In progress** · Owner: m-bonanno · Target: 5 PRs (PR-A through PR-E)
> Supersedes the "M5 — notifications" one-liner on the README roadmap.

## Problem Statement

Budojo is a usable tool through v1.15.0, but it carries gaps that every SaaS user expects to find on day one and can't currently:

- A user who forgets their password has **no way to recover** the account. The `password_reset_tokens` table exists (Laravel default migration), but no controller, route, mailable, or frontend screen consumes it.
- A user who signs up but doesn't finish the academy setup gets **no nudge** to come back. The setup-wizard drop-off is invisible.
- The SPA already shows a dashboard widget for medical certificates expiring in 30 days, and a widget for unpaid athletes after the 15th — but those signals **never leave the dashboard**. An instructor who doesn't open the app on the right day misses them entirely.
- Issue #223 (account hard-delete, GDPR Art. 17) is structurally blocked: the 30-day grace-period flow needs a confirmation email with a "Cancel deletion" link, and that mail can't ship until the email infrastructure is live in production.

The infrastructure to fix all of this is **already 80% in place**: Resend is wired in `config/mail.php`, `MAIL_MAILER=resend` is documented in `server/.env.example`, the `password_reset_tokens` table is migrated, `MustVerifyEmail` + the verification controller already exercise the Mailable + signed-URL pattern in production, and `QUEUE_CONNECTION=database` is set so we don't need Redis. The remaining work is:

1. Surface the missing user flows (password reset, welcome email, deletion confirmation).
2. Bring the queue worker live in production so deferred Mailables actually send.
3. Light up the two signal-out-of-dashboard reminders (medical-cert expiry, unpaid-this-month digest).

## Goals

1. **Foundational auth UX.** Forgotten-password recovery and a welcome email at signup — every web user expects both. Without them the conversion funnel bleeds and support requests pile up.
2. **Unblock #223.** The GDPR account-deletion flow needs a confirmation email with a cancel link; ship it in PR-C so #223 can close.
3. **Move existing in-app signals to email.** Medical-cert expiry (T-30 / T-7 / T-0) and the monthly unpaid digest (16th of each month) are two of the most-cited instructor pains; both queries already exist for the dashboard widgets. Pushing them via email turns Budojo from "I open it weekly" into "it nudges me when something needs me".
4. **Get the queue worker live.** Without it, deferred Mailables would silently sit in the `jobs` table forever. PR-B brings up the supervisor process on Forge.
5. **Stay vendor-agnostic on the deploy seam.** Resend is the production mailer today; nothing in the code or PRs lock us in beyond the `MAIL_MAILER=...` env. If we ever swap to Postmark / Mailgun EU, it's an env edit.

## Non-Goals

- **Push notifications.** PWA push on iOS landed only with Safari 16.4 and is still half-broken; Capacitor wrap (separate roadmap item, M6+) is the better path. M5 is **email-only**.
- **SMS notifications.** Italian SMS gateway pricing is hostile and there is no clear ROI signal for an MVP audience.
- **Athlete-side notifications.** No athlete has a login today; "your payment is due" emails to athletes wait on the athlete portal feature (M6+ roadmap), not M5.
- **Class cancellation / event reminders.** These need class scheduling as instances (currently we only model `training_days` as a weekly mask), which is a separate feature track.
- **Churn-risk surfacing emails** ("Marco hasn't trained in 14 days"). Worth doing but should follow a cohort-retention dashboard widget that validates the signal first; otherwise we ship noise.
- **Sub-processor change broadcasts.** Already documented in `/sub-processors` as a manual process when we actually swap a vendor — no automation needed.
- **In-app inbox / notification center.** All M5 notifications are external (email). An in-app feed is M6+.

## User Stories

Ordered by user impact.

### Account owner — primary flows

1. **Recover forgotten password.** As an academy owner, I want a "Forgot password?" link on the login screen, an email with a recovery link, and a screen to set a new password — so that I can get back into Budojo without contacting support.
2. **Welcome on signup.** As a brand-new user who just registered, I want a welcome email that confirms my account is real and points me to the next step (set up academy / verify email if not done) — so that the first 5 minutes of the product feel guided rather than empty.
3. **Confirmation when I request account deletion.** As an academy owner who clicks "Delete account" (#223), I want an email with the scheduled deletion date and a single-click "Cancel" link valid for the 30-day grace period — so that an accidental click stays reversible.
4. **Email reminder before a medical certificate expires.** As an academy owner, I want an email at T-30, T-7, and T-0 days before any of my athletes' medical certificates expires — so that I can chase the renewal before the athlete is locked out of training.
5. **Monthly digest of unpaid athletes.** As an academy owner, on the 16th of each month I want a single digest email listing every athlete still marked unpaid — so that I don't have to remember to open the dashboard on payment-chase day.

### Account owner — edge and error states

6. **Throttle / rate-limit the password-reset request.** As any user, if I click "Forgot password?" repeatedly, I want the system to throttle me silently rather than send 30 emails — so I don't hammer myself or the mail vendor.
7. **Don't leak account existence on password reset.** As a defensive product, the forgot-password endpoint must respond with the same success message whether the email exists or not — so an attacker can't enumerate accounts.
8. **Survive a transient mail-vendor outage.** As an academy owner whose triggered email fails on the first send, I want the queue to retry up to 3 times with exponential backoff before giving up — so a Resend brown-out doesn't lose my password reset.

## Scope by PR

Five PRs, sequenced by dependency. Each ships independently.

### PR-A — Password reset (foundational)

**Backend (`server/`)**

- New `Auth\PasswordResetController` with two endpoints:
  - `POST /api/v1/auth/forgot-password` — accepts `email`, calls `Password::sendResetLink()`, returns 202 always (no enumeration leak). Throttled per `email` and per IP.
  - `POST /api/v1/auth/reset-password` — accepts `email`, `token`, `password`, `password_confirmation`, calls `Password::reset()`, returns 200 on success / 422 on token invalid or expired.
- New `App\Mail\PasswordResetMail` Mailable (Markdown template). Subject + body i18n-ready by reading the user's stored language preference if we have one; English default otherwise.
- FormRequests for both endpoints.
- PEST tests:
  - `forgot-password` returns 202 on existing email + queues the mail
  - `forgot-password` returns 202 on unknown email + does NOT queue a mail (silent no-op)
  - `forgot-password` is throttled to 6 requests per minute per IP
  - `reset-password` happy path: token from email + new password → user can log in with new password
  - `reset-password` rejects expired token (60 min default), tampered token, mismatched password confirmation

**Frontend (`client/`)**

- `/auth/forgot-password` route + component: email input, submit button, "if your email is registered, we sent you a link" success message.
- `/auth/reset-password?token=…` route + component: token + email picked from query string, two password fields, submit button, error handling.
- Link "Forgot your password?" added to `LoginComponent` template.
- i18n keys in `en.json` + `it.json` in lock-step (the parity check is the trip-wire).
- Cypress E2E:
  - Happy path: login → forgot link → form → success toast → reset URL → form → login with new password
  - Token-invalid: visiting `/auth/reset-password?token=garbage` shows the error and a "request a new link" CTA

### PR-B — Welcome email + queue worker live in production

**Backend**

- New `App\Mail\WelcomeMail` Mailable, queued.
- Triggered from `Auth\RegisterController` (after `User::create`).
- The mail body links to the setup wizard if `academy_id` is null, otherwise to the dashboard.

**Infra**

- Forge `Daemons` configuration for `php artisan queue:work --queue=default --tries=3 --backoff=10`.
- Update `docs/infra/production-deployment.md`:
  - Remove the `# no-op until M5+ adds queue workers` annotation from the deploy script section.
  - Add a "Queue worker" subsection under "Operations runbook" documenting how to restart the daemon and where its logs live.
- Update `docs/api/v1.yaml` if the registration response changes (it shouldn't — the welcome email is a side-effect).

**Tests**

- PEST: registering a user fakes the mail driver and asserts `WelcomeMail` was queued for the new user's email.
- The queue-worker config is verified manually post-deploy (no automated test possible without a running daemon).

### PR-C — Account-deletion confirmation email (closes part of #223)

**Backend**

- New `App\Mail\AccountDeletionRequestedMail` Mailable, queued. Body includes:
  - Confirmation that deletion is scheduled
  - The scheduled execution date (`requested_at + 30 days`)
  - A signed `confirmation_token` URL that hits `DELETE /api/v1/me/deletion-request`
- `App\Actions\User\RequestAccountDeletionAction` extended to dispatch the mail (replaces the `TODO follow-up tracked on #223` comment in `CancelAccountDeletionAction.php:15`).

**Frontend**

- `/auth/account-deletion-cancelled` landing page rendered from the email link. Already in scope of #223; this PR ships the mail-side, the page is part of the #223 PR for the deletion flow itself.

**Tests**

- PEST: requesting deletion fakes the mail driver and asserts the mail was queued with the correct recipient + token.
- PEST: clicking the cancel link removes the `pending_deletions` row and is idempotent on repeat clicks.

This PR partially closes #223 — the deletion-flow PR itself remains a separate workstream that builds on top of this one's email scaffold.

### PR-D — Medical-cert expiry reminder

**Backend**

- New `App\Mail\MedicalCertificateExpiringMail` Mailable, queued.
- New `App\Console\Commands\SendMedicalCertExpiryReminders` artisan command:
  - Walks every academy → every athlete → their valid medical certificate (most-recent + non-expired)
  - For each cert with `expires_on` matching `today + 30`, `today + 7`, or `today`, queues one email per academy (digest of all expiring certs in that academy, not one mail per athlete).
- `app/Console/Kernel.php` schedules the command at 09:00 Europe/Rome daily.

**Tests**

- PEST: golden-path with one academy, three athletes (one expiring at T-30, one at T-7, one with no cert) → one email queued, body contains the two expiring athletes only.
- PEST: idempotency — running the command twice on the same day queues only one email per academy (de-dupe via a small `notification_log` table or a "sent at YYYY-MM-DD for trigger T-30" check).

**Notes**

- The query that powers the existing `expiring-documents-list.component` widget on the dashboard is the same data source. We extract it into a query class that both the SPA endpoint and this command share.

### PR-E — Monthly unpaid-athletes digest

**Backend**

- New `App\Mail\UnpaidAthletesDigestMail` Mailable, queued.
- New `App\Console\Commands\SendUnpaidAthletesDigest` artisan command:
  - Runs on the 16th of each month at 09:00 Europe/Rome.
  - For each academy, queries the same data as the `unpaid-this-month-widget` and queues one digest email listing the athletes who still have no payment for the current month.
  - Skips academies with zero unpaid athletes (no spam).

**Tests**

- PEST: same shape as PR-D — golden path, idempotency, and zero-unpaid-skip case.

## Tech Decisions

- **Mailer**: Resend. Already wired in `config/mail.php`. Production env reads `MAIL_MAILER=resend` + `RESEND_API_KEY`. Both are documented in `server/.env.example`. No vendor change in M5.
- **Queue**: `database` driver. The `jobs` table is migrated. No Redis needed at MVP scale (volume is dozens of emails per day, not thousands).
- **Worker**: single `queue:work` process via Forge `Daemons` UI. `--tries=3 --backoff=10` for transient Resend brown-outs.
- **Mailable templates**: Laravel Markdown templates (`resources/views/mail/...`). Plain English / Italian content; no per-tenant templating.
- **Localisation of email body**: read `User->preferredLanguage` (new column? or already there?) and pick `resources/views/mail/{template}.{locale}.blade.php`. Fallback to English. Decision deferred to PR-A; if the column doesn't exist, we ship English-only in PR-A and add localisation in a follow-up PR. Italian users register with the SPA's IT toggle on, so a flag is straightforward to add.
- **Test pattern**: `Mail::fake()` + `Queue::fake()` per PEST test. Assertion is "was queued with these recipients + this view + these props"; we don't assert on rendered HTML.

## Out of Scope (deferred to future milestones)

- **Athlete-facing portal + their own notifications**: M6+, depends on athlete authentication.
- **Push notifications**: Capacitor wrap (M6+) brings reliable push on both stores.
- **Class scheduling instances + class cancellation reminders**: separate feature track.
- **Churn risk emails**: needs cohort-retention dashboard widget first.
- **Auto-emailed receipts after Stripe payments**: comes with the Stripe Connect feature.
- **In-app notification center / inbox**: M6+.

## Success Criteria

M5 is complete when:

1. A new user can register, recover a forgotten password, and receive a welcome email — all without manual intervention from the maintainer.
2. The queue worker has been running stably in production for at least 7 days, with zero stuck jobs in the `failed_jobs` table.
3. At least one academy with an expiring medical certificate has received a real email (verifiable in Resend's dashboard).
4. At least one academy with unpaid athletes on the 16th has received a real digest.
5. Issue #223 is unblocked — the deletion-confirmation email lands and the cancel link works in production.

## References

- #223 — account hard-delete (depends on PR-C)
- #387 — previous tech-debt sweep that left "queue worker M5+" in `production-deployment.md`
- `server/config/mail.php` — Resend mailer already configured
- `server/.env.example` — `MAIL_MAILER` + `QUEUE_CONNECTION` documented
- `client/src/app/features/documents/expiring/` — query + UI source for PR-D's data
- `client/src/app/shared/components/unpaid-this-month-widget/` — query + UI source for PR-E's data
