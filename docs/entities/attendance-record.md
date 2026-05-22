# Entity — `AttendanceRecord`

## Purpose

One `AttendanceRecord` is one athlete-was-present-on-one-date row. This is M4's atomic unit: the instructor's daily widget creates / removes them, the per-athlete history page reads them, the monthly summary aggregates them, the `attendance_today` push CTA self-creates them, and `GetAthleteAttendanceSummaryAction` projects them into "% di presenze" denominators. There is no concept of "late", "half-session", "tapped out" — either a row exists for `(athlete_id, attended_on)` or it does not. See [`docs/specs/m4-attendance.md`](../specs/m4-attendance.md) for the PRD that pinned this minimalism as a non-goal.

## Schema — `attendance_records`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete, **indexed** | Tenant scoping (an athlete belongs to exactly one academy → an attendance row inherits the academy through it) |
| `attended_on` | date | not null, **indexed** | YYYY-MM-DD. Cast to `Carbon\Carbon` on the model with `date:Y-m-d` so the serialisation stays stable across MySQL (DATE type, time-truncated natively) and SQLite (TEXT type, stores whatever you write). |
| `notes` | text | nullable, max 500 chars | Instructor's free-form note about the session — "did the lapel choke drill", "complained about a sore shoulder". Empty on self-marks. |
| `source` | enum(`'instructor'`, `'self'`) | not null, default `'instructor'` | Who pinned the row (#960). `'instructor'` is the default for every backfill row + every owner-side widget mark. `'self'` is set by `POST /me/attendance/today` (athlete portal). The owner-side daily widget renders a small "Self" badge next to self-marked rows so the instructor can spot anomalies. |
| `created_at` | timestamp | nullable | Stamped by Eloquent on insert. Used by the audit log + the `alreadyNotifiedToday` dedup in `SendAthleteTrainingTodayPushes`. |
| `updated_at` | timestamp | nullable | Stamped on every mutating save. |
| `deleted_at` | timestamp | nullable, **SoftDeletes** | Set on `delete()`. The default Eloquent scope filters tombstones, so "athlete already present today?" checks only see active rows; correcting a mistake = soft-delete the bad row, insert the corrected one. |

### Indexes

- `INDEX(attended_on)` — owner's daily widget query (`whereDate('attended_on', $today)`).
- `INDEX(athlete_id, attended_on)` — per-athlete history window + the cross-athlete present-today check in `MarkAttendanceAction`.
- `INDEX(athlete_id, deleted_at)` — composite that helps the planner avoid a full tablescan when the SoftDeletes global scope filters tombstones.

### No DB-level uniqueness

`(athlete_id, attended_on) WHERE deleted_at IS NULL` would be the natural unique index, but **MySQL 8 has no partial unique index** (the `WHERE` clause is a Postgres-only feature). The same-day idempotency the PRD calls out is therefore enforced **at the app level inside `MarkAttendanceAction`** — under the PRD non-goal #5 single-instructor-per-session constraint, the app-level check is race-safe enough. A future multi-instructor mode would need a MySQL generated-column workaround.

## Relations

- `belongsTo(Athlete::class)` — inverse of `Athlete::attendanceRecords()`.

## Business rules

- **Idempotent marking** — `MarkAttendanceAction::execute(...)` re-submitting the same `(athlete, date)` is a no-op, never a 422. The action's "already present?" check filters via the SoftDeletes scope so a soft-deleted row does NOT block a fresh insert (correct-a-mistake flow).
- **Source defaults to `instructor`** — both for the legacy backfill (every row before #960) and for the owner-side widget. Only `POST /me/attendance/today` pins `source = self`.
- **Athletes can only revert their own self-marks** — `UnmarkTodayAttendanceAction` returns `InstructorLocked` (→ HTTP 403) when today's row is `source = instructor`. Instructors retain DELETE authority on rows of either source via the existing `DELETE /attendance/{id}`.
- **Self-mark today only** — `POST /me/attendance/today` is hardcoded to `Carbon::today()`; there is no `date` parameter. An athlete cannot retroactively claim past presences.
- **Training-day gate** — `POST /me/attendance/today` returns 422 when today's weekday is not in `academies.training_days`. Null/empty `training_days` means "no schedule configured" → today never counts as a training day (the owner must explicitly populate the schedule for self-mark to be legal).
- **Single source of truth for "present"** — the SoftDeletes global scope means every "is this athlete present today?" query returns the active row (or nothing). Tombstones are visible only via the explicit `?trashed=1` query parameter on the owner-side daily widget.

## Wire shape

`AttendanceRecordResource` mirrors the model columns 1:1, including `source` (#960). The full schema lives in [`../api/v1.yaml § AttendanceRecord`](../api/v1.yaml).

## Lifecycle

| Event | Side-effects |
|---|---|
| `created` (any source) | None at the model layer. The `SendAthleteTrainingTodayPushes` cron uses the created row as the "already present, skip the push" signal. |
| `deleted` (soft) | Default SoftDeletes — the row stays in the DB with `deleted_at` set. The owner-side widget's `?trashed=1` view surfaces tombstones for audit / correction. |
| Athlete hard-deleted | Cascade — `athletes.id` deletion cascades to `attendance_records.athlete_id`, dropping the rows entirely (NOT soft-delete). Consistent with the GDPR Art. 17 erasure flow. |

## Related actions

- `MarkAttendanceAction` — bulk insert from the owner-side widget. Accepts `AttendanceSource` parameter (default `Instructor`).
- `MarkTodayAttendanceAction` (#960) — athlete-side single-row insert wrapping the training-day rule + idempotent-fetch.
- `UnmarkTodayAttendanceAction` (#960) — athlete-side revert with source-based authorisation.
- `GetDailyAttendanceAction` — owner's "who's here today?" query.
- `GetAthleteAttendanceAction` — per-athlete history with optional date window.
- `GetAthleteAttendanceSummaryAction` — % presenze denominator clipped at `joined_at` (#893).
- `GetMonthlyAttendanceSummaryAction` — cross-athlete aggregate for the dashboard widget.
- `DeleteAttendanceAction` — owner-side soft-delete (today and past).
