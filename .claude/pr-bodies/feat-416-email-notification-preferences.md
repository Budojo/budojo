## What

Per-category email-notification opt-out preferences (#416). New panel on `/dashboard/profile` with one toggle per digest / reminder category, plus a read-only "always sent" block for transactional emails (welcome, password-reset, email-verification, account-deletion-*, athlete-invitation) that the user cannot opt out of.

Closes #416.

## Why

M5 has shipped multiple digest / reminder emails (medical-cert expiry reminders, unpaid-athletes monthly digest) and the user has no way to opt out of any of them. GDPR / soft-opt-in posture and the existing `notification_log` infrastructure make this both legally cleaner and straightforward to wire. Also unblocks #417 (unsubscribe links in transactional footers — without this column there's nothing to flip).

## How

### Backend

- **Migration**: nullable JSON column `users.notification_preferences`. Null / absent key → "enabled" (default-opt-in). Existing users don't need a backfill.
- **`App\Support\NotificationCategory`** — catalog of toggleable category strings. Two categories ship today (`medical_cert_expiry_reminders`, `unpaid_athletes_digest`); future digests can append.
- **`App\Support\NotificationPreferences`** helper exposing `isEnabled(User, category)` + `update(User, partial-map)`. Centralises the read so dispatchers don't reach into the raw array shape — easier to evolve the schema later. Update silently drops unknown keys defense-in-depth.
- **`SendMedicalCertExpiryReminders`** + **`SendUnpaidAthletesDigest`** now consult the helper before queueing per academy. Skipped users don't claim a `notification_log` row, so re-opt-in on the next trigger picks up naturally without manual intervention.
- **`NotificationPreferencesController`** with GET + PATCH at `/me/notification-preferences`. PATCH validates keys against the catalog (422 on unknown) and values as boolean (422 on non-bool); the helper also drops unknowns as a belt.
- **User model** — `notification_preferences` added to the `Fillable` attribute, `array` cast on the column, property docblock.
- **11 PEST feature specs** cover helper defaults / explicit-false / unknown-key drop / persistence; GET defaults / opt-out reflection / auth-required; PATCH update-and-echo / unknown-422 / non-bool-422; end-to-end dispatcher gate on both digest commands.

### Frontend

- **`ProfileNotificationsComponent`** rendered as a card section on `/dashboard/profile`, between active-sessions and login-history. Optimistic local update on toggle: switch flips immediately, PATCH fires in background, snapshot from echo refreshes state. On failure, switch reverts and an error toast surfaces.
- **`NotificationPreferencesService`** with `show()` + `update(patch)` against the backend.
- **i18n** — EN + IT keys under `profile.notifications.*` (category labels + descriptions, "always sent" transactional block names, error/retry copy). Parity test green.
- **5 vitest specs** cover loading / list+transactional / error / patch-echo / patch-failure-revert.
- **2 cypress E2E specs** cover the populated panel + toggle-fires-PATCH.

### OpenAPI

- New paths `GET /me/notification-preferences` and `PATCH /me/notification-preferences` documenting the wire shape, default-opt-in semantics, and the rejected-unknown-keys 422. Spectral 0 errors.

## Out of scope

- **Unsubscribe links + List-Unsubscribe headers** in transactional footers (#417 — depends on this issue, separate PR).
- **In-app notification center** (#418) and **web push notifications** (#419) — separate categories of "non-email" notifications.
- Per-recipient frequency / quiet-hours preferences — out of scope; today's switches are simple on/off.

## References

- #416 — this issue
- #417 — depends on this; separate PR will add the unsubscribe footer + List-Unsubscribe header
- `notification_log` table from #M5 (`2026_05_04_170000_create_notification_log_table.php`) — kept as the de-dup mechanism; opt-out skips claiming a row, so the dispatcher's per-day idempotency stays consistent

## Test plan

- [x] PHPStan clean
- [x] PEST scope green (204 tests, 677 assertions)
- [x] Vitest 751 specs green (5 new in `profile-notifications.component.spec.ts`)
- [x] Cypress E2E 2 new specs (in CI)
- [x] Spectral OpenAPI 0 errors
- [x] EN/IT i18n parity
- [ ] Manual smoke after deploy: toggle a category off on `/dashboard/profile` → run the relevant cron with `--force` → confirm the academy is skipped
