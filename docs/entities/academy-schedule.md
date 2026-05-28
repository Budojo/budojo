# Entity — `AcademySchedule`

## Purpose

The schedule history of an academy's weekly training days (#1094). Each row is one **"this is the schedule starting on date X"** event; reads for any past or future date resolve to the row with the **largest `effective_from <= date`** for that academy.

This table exists because `academies.training_days` is a single mutable JSON column — if the owner changes Mon/Wed/Fri to Tue/Thu in mid-June, the past-attendance percentage denominators that depended on Mon/Wed/Fri are silently rewritten to Tue/Thu. The history table fixes that without forcing the consumer code through a separate "snapshot" mechanism: every read is date-aware.

Existing `academies.training_days` stays alive as a **denormalised cache** of the current row's schedule — code paths that just want "today's schedule" can keep reading the column. The history table is the source of truth for historical reads.

## Schema — `academy_schedules`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owner academy. Cascade-delete keeps schedule history aligned with academy lifecycle |
| `training_days` | json (list&lt;int&gt;) | nullable | Carbon `dayOfWeek` ints (0=Sun..6=Sat); `null` = "not configured" for this period (parity with the legacy column shape) |
| `effective_from` | date | not null | The first calendar day this schedule is in effect. Stored as `Y-m-d` (no time-of-day) — schedule changes are calendar-day events, not intra-day |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(academy_id, effective_from)` — one transition per academy per day
- `INDEX(academy_id, effective_from)` — covers the hot read `WHERE academy_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`

## Relations

- `belongsTo(Academy::class)` — owning academy

## Business rules

- **Insert-not-update on the write side.** Every `PATCH /api/v1/academy` that touches `training_days` inserts a row with `effective_from = today` (or replaces the same-day row idempotently). Past rows are immutable.
- **Read via `Academy::scheduleForDate(Carbon $date)`.** Never query this table directly outside resource shaping — the helper is the canonical "schedule effective on date X" lookup.
- **`Academy::currentSchedule()`** is sugar for `scheduleForDate(Carbon::today())`.
- **`Academy::nextSchedule()`** returns the soonest row with `effective_from > today`, or `null` when none is pending. By PR 2 application invariant, at most one such row exists per academy at any time (single-pending-change model — see `docs/specs/training-schedule-history.md`).
- **Backfill.** The migration seeds one row per existing academy, carrying that academy's current `training_days` and `effective_from = created_at`. New academies created via `POST /api/v1/academy` get the same seed treatment at create time (one row with `effective_from = today`).
- **Boundary semantics.** A row with `effective_from = today` is the **current** schedule, not the next — `nextSchedule()` uses strict `>` not `>=`.
- **Cascade on academy delete.** Deleting an academy deletes its schedule history. Schedule history rows have no domain meaning without an owner academy.
- **No soft-delete.** History is append-only; there's no notion of "un-scheduled" — removing a future change is done by deleting the pending row outright (PR 2 endpoint).

## API surface

Exposed via `AcademyResource` (`GET /api/v1/academy`):

| Key | Shape | Notes |
|---|---|---|
| `current_schedule` | `{ id, training_days, effective_from }` or `null` | The row in effect today |
| `next_schedule` | `{ id, training_days, effective_from }` or `null` | The pending future change, or `null` |
| `schedules` | `Array<{ id, training_days, effective_from }>` | Full history, ordered most-recent-first |

`effective_from` is always serialised as `YYYY-MM-DD` (no time component).

Dedicated CRUD endpoints for schedule rows ship in **PR 2** (`POST /api/v1/academy/schedules`, `DELETE /api/v1/academy/schedules/{id}`).

## Related

- [`academy.md`](./academy.md) — owning entity, denormalised `training_days` cache
- [`attendance-record.md`](./attendance-record.md) — the read consumer; percentage denominators depend on schedule history
- `docs/specs/training-schedule-history.md` — full PRD (#1095)
