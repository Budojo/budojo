## What

In-app notification center: a bell icon in the dashboard topbar shows an unread count badge and opens a panel listing the last 20 notification rows for the user. Each row deep-links to the originating object (athlete detail, payments, etc.) and flips to "read" on click. A "Mark all read" CTA at the top bulk-flips.

## Why

There's no in-app surface for the reminder digests (medical-cert expiry, unpaid-athletes monthly). Users only learn about state changes when they happen to open the relevant page or check email. The bell is a low-pressure fallback that lives where every other SaaS user expects it (Jakob's Law — top-right) and is also the foundation web-push notifications would render into later.

## How

**Server (Laravel 13)**

- Migration adds the standard Laravel `notifications` table (UUID PK, polymorphic `notifiable_type` / `notifiable_id`, JSON `data`, `read_at`). The composite index on `(notifiable_type, notifiable_id, read_at)` backs the bell-open hot path.
- `NotificationInboxController` exposes 3 endpoints:
  - `GET /me/notifications` — latest 20 rows + unread count for the badge.
  - `POST /me/notifications/{id}/read` — idempotent single-row flip. 404 on cross-user ids; the shape matches the never-existed branch so the status code can't enumerate other users' notification ids.
  - `POST /me/notifications/read-all` — bulk flip + count returned.
- 8 PEST feature specs cover the read paths, idempotency, cross-user 404 isolation, and the auth gates.

**Client (Angular 21 + PrimeNG 21)**

- `NotificationInboxService` — signal-backed state (`rows`, `unread`, `hasUnread`). Optimistic local update on mark-read so the badge ticks down immediately without waiting on the roundtrip.
- `NotificationBellComponent` — bell icon + badge + PrimeNG `p-popover` panel with empty / loading / list states. Clicking a row navigates to the row's link AND marks it read in the same handler. Mounted in the dashboard topbar left of the avatar chip — keeping the chip's top-right slot for "manage my account" (Jakob's Law).
- i18n full EN+IT lockstep.
- Vitest specs for the service (3 covering hydration, mark-one, mark-all).

**Docs**

- `docs/api/v1.yaml` — 3 new operations.

## Notes

- The `notifications` table is distinct from the existing `notification_log` table (M5 PR-D). `notification_log` is an academy-scoped DEDUP for outbound emails (so a cron re-run doesn't email twice). `notifications` is per-USER inbox state — what the bell renders. The two coexist by design.
- The standard Laravel polymorphic shape leaves room for a future per-academy feed (`notifiable_type = App\Models\Academy`); today every row is `notifiable_type = App\Models\User`.

## Out of scope (deferred to follow-up issue)

- Extending the M5 PR-D (medical-cert expiry digest) and PR-E (unpaid-athletes monthly digest) commands to ALSO write a database notification alongside their email. Touched separately so the existing email channel doesn't co-mingle review surface area with the inbox shape. The inbox is ready to be populated by any Notification class invoked via `$user->notify(new Notification)` — that wiring lands in a focused PR.
- Real-time push via WebSockets / Pusher (the bell refreshes on document `visibilitychange`, which covers the common "switched tab and came back" case without polling).
- Per-academy notification feeds (multi-user umbrella dependency).
- Browser push notifications (#419, separate issue).

## References

- Closes #418

## Test plan

- [x] `vendor/bin/pest tests/Feature/Notifications` — 8 specs green (20 assertions).
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [x] `npm test -- --watch=false` — 775 specs green (763 baseline + onboarding 6 + notifications 6).
- [x] `npm run lint` — clean.
- [ ] Cypress E2E spec to ship in follow-up alongside the M5 reminder integration (the inbox path is testable today but needs at least one Notification produced via the reminder channel for a meaningful end-to-end shape).
- [ ] Manual smoke: bell renders, badge shows count, click navigates + flips row.
