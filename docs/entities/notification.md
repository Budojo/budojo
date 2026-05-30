# Entity — `Notification` (in-app inbox)

## Purpose

A `Notification` row is one entry in a user's in-app notification inbox — the bell-icon dropdown in the dashboard topbar (#418). The table is Laravel's standard `notifications` shape, populated by any `App\Notifications\*` class invoked through `$user->notify(new …)`. Surfaces medical-cert expiry digests, unpaid-athlete reminders, system messages — all the things the user would otherwise only see in email.

The in-app inbox is an additional fan-out channel, NOT a replacement for transactional email. The two coexist: the same `Notification` class can implement both `toDatabase()` (writes a row here) and `toMail()` (sends the email). Today (v2.6.0) the inbox surface ships; the actual fan-out wiring for the medical-cert / unpaid-athletes digests lands in a focused follow-up.

## Schema — `notifications`

Created by the standard Laravel `php artisan notifications:table` migration shape, with one tweak (the composite index on the bell-open hot path).

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | uuid | PK | Matches Laravel's default `Notifiable::notifications()` relation contract — adding an int surrogate would force a custom relation override. |
| `type` | string | not null | Fully-qualified Notification class name (e.g. `App\Notifications\MedicalCertExpiringNotification`). The SPA reads this to choose the right rendering template. |
| `notifiable_type` | string | morph type | Always `App\Models\User` today; the polymorphic shape leaves room for a future per-academy feed. |
| `notifiable_id` | bigint unsigned | morph id | FK to `users.id` in practice. |
| `data` | json | not null | Whatever the Notification's `toDatabase()` returns. The SPA reads `data.title`, `data.body`, `data.link` keys to render each row. |
| `read_at` | timestamp | nullable | Set when the user explicitly marks the row read OR when they click "Mark all as read". Null = unread; drives the bell-icon unread count. |
| `created_at` | timestamp | nullable | Bumped to the latest event time when a community interaction notification folds onto this row (#1139), so the aggregate re-sorts to the top of the inbox. |
| `updated_at` | timestamp | nullable | |

## Relations

- `morphTo('notifiable')` — in practice always points to a `User`.

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(notifiable_type, notifiable_id, read_at)` — backs the bell-open hot path: `WHERE notifiable_type=? AND notifiable_id=? AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`.

## Business rules

- **Distinct from `notification_log`** — that table (M5 PR-D) is academy-scoped dedup for OUTBOUND emails so a re-run of the cron doesn't email twice. This table is user-scoped inbox state — what the user sees in the bell. The two coexist; population by future reminder integrations updates BOTH.
- **`data.link` is the deep link** the SPA navigates to when a row is clicked. Server-side notifications writing into this table should include it when there's a sensible destination (the athlete whose cert is expiring, the payment month, etc.).
- **Read-state idempotency** — `POST /me/notifications/{id}/read` is idempotent: re-posting on an already-read row does NOT advance `read_at`. The first flip is the meaningful one.
- **Read-state ownership** — `POST /me/notifications/{id}/read` on another user's id returns `404` with the same shape as a never-existed id, so a probe can't enumerate other users' notification UUIDs by status code.
- **Bulk mark-as-read** — `POST /me/notifications/read-all` performs a single bulk `UPDATE ... WHERE read_at IS NULL` (#418 follow-up). The affected-row count IS the `marked_read` total — no N+1 load-then-flip.
- **Write-time aggregation of community interactions (#1139)** — a burst of reactions / comments / replies / RSVPs on the same post folds into ONE unread row per recipient ("{most-recent actor} and {N} others …") instead of stacking a row + push per event. The fold matches the recipient's existing **unread** row of the same `type` for the same `data.post_id`; once that row is read, the next event starts a fresh notification (and a fresh push — only the first event of a group pushes, "push once then silent"). An internal `data.aggregate_actor_ids` list dedupes the actor count (an actor acting twice — e.g. an emoji swap — does not inflate it) and is **not** projected by `GET /me/notifications`. The fold bumps `created_at` so the aggregate bubbles to the top. Lives in `App\Support\InboxAggregator`; only the four community interaction notifications opt in via `App\Notifications\Contracts\AggregatesInInbox` — system notifications (recap, payment, promotion, …) are never aggregated.
- **No retention cron today.** The reminder digests run daily / monthly, so a single owner's inbox grows by ~13 rows per year — well within scan-cost concerns. A TTL or "keep last 100 per user" sweep lands the day the table size becomes a problem.

## Related endpoints

- `GET /api/v1/me/notifications` — latest 20 rows + unread count for the bell badge (#418)
- `POST /api/v1/me/notifications/{id}/read` — mark one row as read (#418)
- `POST /api/v1/me/notifications/read-all` — bulk flip every unread row (#418)

## Related tables

- `users` — see [`user.md`](./user.md)
- `notification_log` — M5 dedup for outbound emails. Distinct from this table; the two coexist.
- `push_subscriptions` — see [`push-subscription.md`](./push-subscription.md) (the additional fan-out channel; in-app inbox + browser push are sibling surfaces, both populated by the same Notification classes via different `via()` channels).
