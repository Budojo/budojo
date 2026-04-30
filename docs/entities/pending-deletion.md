# Entity — `PendingDeletion`

## Purpose

Backs the GDPR Art. 17 right-to-erasure flow (#223). The presence of a row marks the owning `User` as **pending hard-deletion** — the user clicked "Delete account" and is in a 30-day grace window during which the SPA renders a cancellation banner; login and authenticated API calls still work, so the user can either change their mind (`DELETE /me/deletion-request`) or pull a final export (`GET /me/export`). After `scheduled_for`, a scheduled task (TODO follow-up) runs `App\Actions\User\PurgeAccountAction` to do the actual hard-delete cascade. The decision on whether to lock login during the window (vs the current "everything still works, banner only" UX) is the open question tracked at the bottom of this page.

## Why a separate table, not soft-delete on `users`

This is documented in detail on issue #223. Short version:

- GDPR Art. 17 wants **vera erasure**, not a tombstone — having both a soft-delete and a hard-delete path duplicates surface area
- `users.email` uniqueness would need `whereNull('deleted_at')` on every constraint, leaking the soft-delete concern into every login + registration query
- Every authenticated query against `User` would have to remember `withoutTrashed()` — a permanent cognitive cost for a rare scenario
- There is no domain consumer for "deleted user accounts" — no UI page lists them, no report references them. Soft-delete without a consumer is complexity for nothing

A separate `pending_deletions` table gives us a **time-bounded explicit mechanism** with a known expiry, instead of an indefinite tombstone.

## Schema — `pending_deletions`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `user_id` | bigint unsigned | FK `users.id`, **unique**, cascade on delete | One pending row per user max — a second click while one is already pending is a no-op (idempotent at the Action layer) |
| `requested_at` | timestamp | not null | When the user actually clicked "Delete account" |
| `scheduled_for` | timestamp | not null, **indexed** | Always `requested_at + 30 days`. Indexed because the cron job filters on `scheduled_for <= now()` to find the accounts that have aged past the grace window |
| `confirmation_token` | string(64) | not null, **unique** | Random 64-char opaque token. Today the cancellation flow uses the authenticated session (`DELETE /me/deletion-request`) — this column is reserved for the email-link cancellation flow that lands as a follow-up. UNIQUE so the future token-based lookup is unambiguous and indexed cheaply |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

## Relations

- `belongsTo(User::class)` — exposed as `pending->user`
- Inverse: `User::pendingDeletion()` returns `HasOne<PendingDeletion>` (at most one row per user)

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(user_id)` — at-most-one pending row per user
- `INDEX(scheduled_for)` — the cron's filter column
- `UNIQUE(confirmation_token)` — the email-link lookup column (used by the future token-based cancel endpoint)

## Business rules

- **Idempotent request.** A second `POST /api/v1/me/deletion-request` while a row already exists returns the existing row instead of creating a new one. This prevents a malicious caller from indefinitely deferring the actual purge by re-clicking.
- **Grace period 30 days.** Lives as `RequestAccountDeletionAction::GRACE_DAYS` so it can be tuned in one place.
- **Cancellation is gracious.** `DELETE /api/v1/me/deletion-request` with no row returns `200 { cancelled: false }` — cancelling something that was never pending is a no-op, not a 404.
- **Password re-auth.** `POST /me/deletion-request` requires the current account password in the body. Re-authentication gate per UX canon — the user is already authenticated via Sanctum, but the action is irreversible after the grace window so we ask twice.
- **Surfaced on `/auth/me`.** The user resource carries a `deletion_pending` block when applicable: `{ requested_at, scheduled_for }`. The SPA reads this on bootstrap to render the warning banner.

## Related endpoints

- `POST /api/v1/me/deletion-request` — request hard-deletion, enters grace
- `DELETE /api/v1/me/deletion-request` — cancel during grace
- `GET /api/v1/auth/me` — `data.deletion_pending` reflects this row's existence

## Future / TODO

These are out of scope for the initial PR (#223) and tracked as follow-ups:

- **Scheduled cron job** that hits all `pending_deletions` with `scheduled_for <= now()` and runs `PurgeAccountAction`. Until this lands, the grace window expires logically but the purge does not auto-execute — admin runs the Action manually.
- **Email reminders.** A 7-day-before-purge email with the cancel-token link, a 24-hour reminder, and a confirmation post-purge.
- **`athlete_payments` retention.** Currently payments cascade-delete with the athlete during purge — wipe is GDPR-compliant but loses fiscal records. A migration will make `athlete_id` nullable plus snapshot the athlete name, and `PurgeAccountAction` will then anonymise payment rows instead of cascade-deleting them. Until then the user's `/me/export` (#222) is how they preserve a copy.
- **SPA UI**: Profile danger zone with double confirm + topbar banner during grace + cancel-link landing page for the email confirmation flow.
- **Login during grace.** Behaviour TBD — block login (cleaner GDPR), or allow login with the SPA showing only the cancellation banner (more humane). Currently login still works.
