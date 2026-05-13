# Account deletion

Canonical English source — auditor- and reviewer-readable. Two SPA components mirror this content per the standing lock-step rule (`/privacy{,/it}` is the precedent): edits here MUST land in the same PR as `client/src/app/features/account-deletion/account-deletion.component.html` (English at `/account-deletion`) and `client/src/app/features/account-deletion/it/account-deletion-it.component.html` (Italian at `/account-deletion/it`).

This page exists primarily to satisfy Google Play's Data Safety form requirement that an app supporting account creation expose a publicly reachable URL describing the account-deletion process. The Play Store reviewer visits the URL during policy review.

## 1. Scope

Budojo is a martial-arts academy management web application — registration, athlete roster, attendance, documents, payments, community feed. Operator (registered owner) accounts are the subject of this page; athlete-side accounts that join via an athlete invite follow the same rules.

## 2. How to request deletion

### Today — by email

Write to **privacy@budojo.it** from the email address you registered with. Subject line "Account deletion". Include your registered name so we can match the request to a single account.

Budojo confirms receipt within five working days and initiates the request on your behalf. Once the request is recorded, the 30-day grace window starts (§ 5 below).

### Future — in-app, from the SPA

A "Delete account" entry will land in the user profile page (`/dashboard/profile`) in a follow-up release. The in-app flow re-authenticates with the current password and goes through the same 30-day grace window as the email path. **This UI is not yet shipped**; the email path above is the canonical request channel today.

## 3. What is deleted

After the grace window elapses, the hourly `budojo:purge-expired-pending-deletions` Artisan command runs `App\Actions\User\PurgeAccountAction`, which executes a hard-delete cascade. The following is permanently removed from the production database and from object storage:

**User account**

- First name, last name, display handle
- Email address, phone number, postal address (line 1/2, city, postal code, province, country)
- Date of birth, avatar (uploaded photo)
- bcrypt password hash, Sanctum API tokens, two-factor secret and recovery codes
- Active sessions, push notification subscriptions
- Notification preferences, language preference
- Login history (IP and user-agent rows)

**Academy** — if the user is the registered owner

- Academy name, logo, address, contact phone, email, URLs
- Sub-processor consent state, DPA acceptance timestamp

**Athletes** — every athlete belonging to the deleted user's academy, including any soft-deleted athletes

- Anagrafica: first name, last name, date of birth, gender, belt and stripe state, federation registration status, guardian contacts
- Profile photos, every uploaded document (medical certificates, federation cards, ID scans)
- Attendance history, payment history, belt promotion history

**Community feed** — authored by the deleted user

- Posts, comments, RSVPs, reactions

Binary files on disk (academy logos, user avatars, athlete photos, uploaded documents) are wiped in a post-commit step after the database cascade succeeds, so the database state and the file system stay consistent.

## 4. What is retained

After deletion, the following residual data is kept for a strictly limited time:

- **Application logs** — at most 30 days, for fraud and abuse review (rotation is automatic)
- **CDN access logs** (Cloudflare) — at most 30 days, same purpose
- **Database backups** — at most 30 days from the deletion (automatic rotation)
- **Outbound email archives** at the email provider — at most 30 days

None of the above is exposed in the application; none is used to reconstruct an account or contact the deleted user. No personally identifiable data is retained beyond these windows.

> **Planned change** — a future migration will make `athlete_payments.athlete_id` nullable and snapshot the athlete name inline, so payment rows can be anonymised and retained for the 10-year fiscal record-keeping required by Italian tax law. **This is not in production today**; payment rows are currently cascade-deleted along with the athlete. This page will be updated in lock-step with that migration.

## 5. Grace window — 30 days

When the request is made (email today, in-app in a future release), Budojo creates a `pending_deletions` row with `scheduled_for = requested_at + 30 days`. During this window:

- The user can cancel by clicking the link in the deletion confirmation email (token-bound public endpoint, no login required from the click) or by visiting the dashboard, where a banner offers a one-click cancellation.
- The account stays fully functional — login, dashboard access, and authenticated API calls all still work. The banner is the only visible signal.
- Re-clicking the delete button while a row is pending is a no-op — the existing scheduled date is not extended. This prevents indefinite deferral.

After `scheduled_for` elapses, the hourly cron runs `PurgeAccountAction`. Once that runs, the deletion is irreversible.

## 6. Export your data before deletion

A complete JSON export of the user's personal data — GDPR Art. 15 right of access and Art. 20 right of portability — is available through the authenticated `GET /api/v1/me/export` endpoint. The dashboard exposes a one-click "Export my data" button that hits this endpoint. Users are advised to run an export before confirming a deletion, because the data is unrecoverable after the grace window elapses.

## 7. Contact

- **Privacy and deletion requests** — privacy@budojo.it
- **Data controller details** — see the [Privacy Policy](/privacy) (English) or the [Informativa sulla Privacy](/privacy/it) (Italian, legal source of truth)
- **Right to lodge a complaint** with the Italian DPA (Garante per la protezione dei dati personali) — https://www.garanteprivacy.it

## 8. Versioning

This page is updated whenever the deletion flow changes — new retention window, new in-app UI surface, payment anonymisation migration. The version number and last-updated stamp are rendered at the bottom of the SPA pages.

- Version: 1.0
- Last updated: 2026-05-13
