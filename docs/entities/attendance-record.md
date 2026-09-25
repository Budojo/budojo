# Entity — `AttendanceRecord`

## Purpose

One `AttendanceRecord` is one athlete-was-present-on-one-date row. This is M4's atomic unit: the instructor's daily widget creates / removes them, the per-athlete history page reads them, the monthly summary aggregates them, the `attendance_today` push CTA self-creates them, and `GetAthleteAttendanceSummaryAction` projects them into "% di presenze" denominators. There is no concept of "late", "half-session", "tapped out" — either a row exists for `(athlete_id, attended_on)` or it does not. See [`docs/specs/m4-attendance.md`](../specs/m4-attendance.md) for the PRD that pinned this minimalism as a non-goal.

## Schema — `attendance_records`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete, **indexed** | Tenant scoping (an athlete belongs to exactly one academy → an attendance row inherits the academy through it) |
| `lesson_id` | bigint unsigned | FK `lessons.id`, **null on delete**, nullable, **indexed** | Which [lesson](./lesson.md) the presence was recorded into (#1562). Null when it was recorded without one — three sources: every row that predates the timetable, any day the academy has no class, and the athlete's own self-mark (`POST /me/attendance/today`, which knows no class and is behind the `athlete_accounts` capability, off in the desktop build). A class-less row reads as present in every class of its day. **It is attributed afterwards when, and only when, the day had one session to be at (#1590)** — the owner tagging that session's topics adopts the day's unattributed rows, and a one-shot migration did the same for rows already on disk. The original rule here said a backfill would be inventing history, and that is still true of a *guess*: the guard is what makes it not one. Where the academy had two classes on that weekday, or two lessons on that date, nothing is attributed and the row stays null, because a presence that names neither could have been at either. Without this the lesson never reads as `held` and the coverage view reports a tagged, well-attended session as nothing taught. |
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
- `belongsTo(Lesson::class)` — nullable; inverse of `Lesson::attendanceRecords()` (#1562).

## Business rules

- **Idempotent marking** — `MarkAttendanceAction::execute(...)` re-submitting the same `(athlete, date)` is a no-op, never a 422. The action's "already present?" check filters via the SoftDeletes scope so a soft-deleted row does NOT block a fresh insert (correct-a-mistake flow).
- **With a class, the unit is `(athlete, date, lesson)`** (#1562). `POST /api/v1/attendance` with an `academy_class_id` materialises that class's lesson for the day (first tap creates, every tap after reuses — inside the same transaction as the inserts) and records the presence into it. The same athlete can be in the kids' class at 17:00 and the adults' at 19:00: two rows, not a duplicate. A presence on the day **with no lesson** still counts as "already present" for every class of that day, so a Monday from before the timetable existed does not read as empty once Monday has one. Without a class nothing changes from before.
- **Reading by class** — `GET /api/v1/attendance?date=…&academy_class_id=…` returns that class's lesson **plus** the day's class-less presences, and leaves out rows that belong to a *different* class that day. A GET never creates a lesson. A class from another academy is a 403, like an athlete from another academy.
- **Two units, and which reader uses which (#1765).** A **row** is one presence on a day, tied to a lesson when there is one (a row with no lesson is still a row: from before the timetable, marked without a class, or self-marked); a **day** is one presence for counting. An evening in the gi class and the no-gi class is two rows and one day. The roster's month and season counts (`attendance_month_count`, `attendance_total_count`) and the monthly summary count **days** (`count(distinct attended_on)`), because the fraction they sit in divides by days and printed `2/1` when they counted rows; the leaderboard always did. **Rows** are what coverage (#1590) and mat hours (#1591) read, because they need the lesson. Refusing the second row at check-in is not a fix: it is correct data.
- **Carnets count by the academy's own rule (#1576).** `ReconcileCarnetEntriesAction` spends one entry per lesson or per day, per `academies.carnet_entry_unit`: under `lesson` an athlete checked into two classes on one evening spends two entries, under `day` the second class on a day already charged costs nothing. See [`carnet-entry.md`](./carnet-entry.md).
- **Source defaults to `instructor`** — both for the legacy backfill (every row before #960) and for the owner-side widget. Only `POST /me/attendance/today` pins `source = self`.
- **Athletes can only revert their own self-marks** — `UnmarkTodayAttendanceAction` returns `InstructorLocked` (→ HTTP 403) when today's row is `source = instructor`. Instructors retain DELETE authority on rows of either source via the existing `DELETE /attendance/{id}`.
- **Self-mark today only** — `POST /me/attendance/today` is hardcoded to `Carbon::today()`; there is no `date` parameter. An athlete cannot retroactively claim past presences.
- **Training-day gate** — `POST /me/attendance/today` returns 422 when today's weekday is not in `academies.training_days`. Null/empty `training_days` means "no schedule configured" → today never counts as a training day (the owner must explicitly populate the schedule for self-mark to be legal).
- **Single source of truth for "present"** — the SoftDeletes global scope means every "is this athlete present today?" query returns the active row (or nothing). Tombstones are visible only via the explicit `?trashed=1` query parameter on the owner-side daily widget.
- **Who is drifting is measured against the athlete's own habit, in realised sessions (#1728).** `AtRiskAthletesAction` (`GET /stats/attendance/at-risk`) reads the academy's **realised sessions** — every distinct day anyone was checked in, the denominator `GetAthleteAttendanceSummaryAction` already uses — newest first, clipped per athlete at `joined_at`. Tonight counts for an athlete only once they are ticked: today becomes a session as soon as the first person is checked in, and not being checked in yet to a session still in progress is not an absence. Counting sessions instead of weeks makes it closure-proof: a closed August contributes nothing, so September does not flag the whole roster. `recent` is the athlete's last 8 sessions, `baseline` the 24 before those. One tier, the most severe that applies:
  - **`gone`** — 0 of `recent`, and last seen more than 21 days ago (or never, since joining);
  - **`quiet`** — 0 of the last 3 sessions, for an athlete whose own baseline rate says they would normally have come at least once in 3 (`baseline_attended / baseline_sessions × 3 ≥ 1`): missing three is news about someone who comes every other night and an ordinary week for someone who comes once in four;
  - **`dropping`** — `baseline` holds at least 6 presences, and the recent rate is under half the baseline rate.

  Left out, all of them: status other than `active`; `joined_at` within the last 28 days; a `baseline` window of fewer than 12 sessions (not enough of their history to say anything). `meta.sessions_available` counts the realised sessions **before today**, for the same reason tonight is left out of an unticked athlete's windows: on the evening of the 20th session, counting tonight would tell the client there is enough history while everyone not yet ticked was judged on 19. `meta.has_attendance` does count tonight, so an academy's first evening (0 sessions before today, a register under way) reads as "not enough history yet", never as "no attendance recorded". The comparison is against the athlete's own record because this academy has no single expected frequency: someone who always came once a week and came once last week is fine, someone who came four times a week and now comes once is not.
- **The at-risk list and the bell's missed-streak push disagree, by design.** `SendAthleteMissedStreakPushes` walks the **scheduled** weekdays in `academies.training_days` and asks about consecutive absence; the at-risk list walks the **realised** dates and asks about a ratio. A Friday the academy cancelled is a miss for the push and invisible to the list. They need different denominators; neither should be made to call the other.
- **A regular of a class is someone at 3 of its last 4 occurrences (#1730).** `GetClassRegularsAction` (`GET /attendance/regulars?date=…&academy_class_id=…`) answers the check-in's "who usually comes and is not here tonight". An **occurrence** is a day before `date` on which the academy held a session (a distinct `attended_on`, as the at-risk list reads them) on the class's weekday (`academy_classes.weekday`, Carbon 0=Sun..6=Sat) — read from the attendance, not from `lessons`, which exist only since #1562 and would leave the answer empty on every academy with history. A presence **counts for the class** when it names the class's lesson that day, or names no lesson on a day the academy had one session to be at: one class on that weekday, and no other class's lesson that date. That is the adoption rule of #1590 (`AdoptUnattributedAttendanceAction`, and the backfill migration's lines 26–35), reused rather than re-derived. **On a weekday two classes share**, a presence naming neither counts for neither — it could have been at either — and a day on which nobody named this class is not one of its occurrences at all; the walk keeps going back until it finds four that are. **The walk ends where the timetable moved**: at the first evening a class timetabled on another weekday now held on this one, that evening and every one before it were that class's, lesson or no lesson, so reading past it would credit the old timetable's habit to this class. A class that *shares* the weekday ends nothing — an evening only it ran is skipped. Crediting those rows would make every regular of one class a regular of both, confidently and wrongly, which is worse than an empty panel. The rule then needs at least 3 occurrences: below that the list is empty and `meta.occurrences` says how many there were, so the client can say "we cannot tell yet" rather than "everyone is here" — the common state for a class's first fortnight. Only `active` athletes, and all of the class's regulars: the check-in subtracts who it already has on the mat, so a tick takes someone off the panel without a request. It misses athletes who rotate between classes (2 of 4 in each) on purpose: this finds habits tied to a slot, and the at-risk list finds volume habits. `last_attended_on` is their latest presence **before** `date`, in any class.

## Wire shape

## What an athlete has seen — per-athlete coverage (#1567)

`GET /athletes/{athlete}/syllabus-coverage` reads the join between this table's `lesson_id` and `lesson_topic` for one person, and it is deliberately **not** the academy view with a filter on it.

- **Four states, not three.** `seen` / `thin` / `missed` / `not_taught_yet`. Merging the last two into "never seen" would write a low number on a person for a decision somebody else made about the programme — which is exactly the scoreboard the screen must not become.
- **The denominator is what the academy taught**, not the whole syllabus. The number answers *"how much of what happened did you catch?"* and never *"how much of the syllabus are you?"*. `not_taught_yet` is reported beside the fraction, never inside it.
- **Scoped to on or after `athletes.joined_at`.** Nobody misses what predates them, and a denominator that says otherwise is not honest, just discouraging.
- **Unattributed presences are stated, not counted as absence.** A row with `lesson_id` null says they trained and cannot say what they trained; treating that as a gap would report a missing record as a fact about a person. The count rides along so the screen can say so.
- Gated on `attendance_read`, not `stats_view`: it lives beside the athlete's attendance, and the reader is the instructor planning their next private lesson.

`AttendanceRecordResource` mirrors the model columns 1:1, including `source` (#960) and `lesson_id` (#1562). The full schema lives in [`../api/v1.yaml § AttendanceRecord`](../api/v1.yaml).

## Lifecycle

| Event | Side-effects |
|---|---|
| `created` (any source) | None at the model layer. The `SendAthleteTrainingTodayPushes` cron uses the created row as the "already present, skip the push" signal. `AttendanceObserver` fires the achievement evaluator. Separately, `MarkAttendanceAction` charges a carnet entry for the row when the athlete's month is not covered by the monthly fee (#1364) — see [`carnet-entry.md`](./carnet-entry.md). |
| `deleted` (soft) | Default SoftDeletes — the row stays in the DB with `deleted_at` set. The owner-side widget's `?trashed=1` view surfaces tombstones for audit / correction. Any carnet entry the row consumed is **hard**-deleted in the same transaction, so a refunded entry is spendable again (#1364). |
| Athlete hard-deleted | Cascade — `athletes.id` deletion cascades to `attendance_records.athlete_id`, dropping the rows entirely (NOT soft-delete). Consistent with the GDPR Art. 17 erasure flow. |

## Related actions

- `MarkAttendanceAction` — bulk insert from the owner-side widget. Accepts `AttendanceSource` parameter (default `Instructor`).
- `MarkTodayAttendanceAction` (#960) — athlete-side single-row insert wrapping the training-day rule + idempotent-fetch.
- `UnmarkTodayAttendanceAction` (#960) — athlete-side revert with source-based authorisation.
- `GetDailyAttendanceAction` — owner's "who's here today?" query, optionally narrowed to one class (#1562).
- `GetClassRegularsAction` (#1730) — who usually comes to a class: present at 3 of its last 4 occurrences.
- `App\Actions\Lesson\MaterialiseLessonAction` — the class's lesson for the day, found or created (#1562).
- `GetAthleteAttendanceAction` — per-athlete history with optional date window.
- `GetAthleteAttendanceSummaryAction` — % presenze denominator clipped at `joined_at` (#893).
- `GetMonthlyAttendanceSummaryAction` — cross-athlete aggregate for the dashboard widget.
- `DeleteAttendanceAction` — owner-side soft-delete (today and past).
