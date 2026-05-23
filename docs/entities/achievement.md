# Entity — `Achievement`

## Purpose

An `Achievement` row is one lifetime milestone unlocked by an athlete on the mat (#961). Five kinds ship in v2.30.0 — first class, 30-day streak, 100 sessions, 1 year at the academy, belt promotion — and the table is shaped to absorb new kinds without a migration (one column per metadata field would not scale).

Unlocks are computed by `EvaluateAchievementsAction`, fired from `AttendanceObserver` on every new attendance row (event-bound, real-time for activity-based kinds) and from `EvaluateTimeBasedAchievements` (nightly 02:00 cron, for time-based kinds where no event would otherwise fire — anniversary, streak).

Surfaced on the public-profile read (`GET /api/v1/users/{handle}/profile`) as a `achievements[]` array, each entry carrying `kind`, `unlocked_at`, and the kind's `metadata` (e.g. the awarded belt for a `belt_promotion`). The SPA renders one badge per row on the public profile card.

## Schema — `achievements`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `athlete_id` | bigint unsigned | not null, FK → `athletes.id` ON DELETE CASCADE | Athlete who unlocked the milestone |
| `kind` | string(64) | not null | One of the `App\Enums\AchievementKind` cases (see table below). Stored as the enum's `value` (e.g. `'first_class'`, `'30_day_streak'`) so a future kind addition needs no migration. |
| `unlocked_at` | timestamp | not null | When the evaluator marked the milestone unlocked. For real-time kinds: the attendance row's `attended_on` (or the moment of belt promotion); for nightly cron kinds: the cron run's `now()`. |
| `metadata` | json | nullable | Kind-specific extra fields. Today: `belt_promotion` carries `{ "belt": "blue" }` to remember which belt was awarded; other kinds emit `null`. |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

### Indices

- `UNIQUE (athlete_id, kind)` — guarantees idempotency. `EvaluateAchievementsAction` is safe to re-run; the second insert with the same `(athlete_id, kind)` is rejected at the DB layer. Exception: `belt_promotion` (multiple promotions per athlete are valid) — implementation enforces idempotency at the application layer by checking `unlocked_at` against the promotion timestamp.

## `AchievementKind` enum

The backing PHP enum `App\Enums\AchievementKind` is the source of truth. Adding a kind = a new case + a new check method in `EvaluateAchievementsAction` + an SPA glyph lookup.

| Case | Stored value | Trigger | Cron / event |
|---|---|---|---|
| `FirstClass` | `first_class` | Athlete's first-ever `attendance_records` row | `AttendanceObserver` on create |
| `ThirtyDayStreak` | `30_day_streak` | 30 consecutive calendar days with at least one attendance row | Nightly 02:00 cron |
| `HundredSessions` | `100_sessions` | 100 total `attendance_records` rows for the athlete | `AttendanceObserver` on create |
| `OneYearAtAcademy` | `1_year_at_academy` | 365 days since `athletes.joined_at` | Nightly 02:00 cron |
| `BeltPromotion` | `belt_promotion` | Belt changed on the athlete (delegates to `AthleteObserver` belt-change branch) | `AthleteObserver` on update |

## Relations

- `Achievement` → `Athlete` — `belongsTo`. `Achievement::athlete()`. Inverse `Athlete::achievements()` (`hasMany`, ordered by `unlocked_at` desc).

## Business rules

- **Idempotent**: re-running the evaluator never produces duplicates (`UNIQUE (athlete_id, kind)` for the four non-belt kinds; application-level check for `belt_promotion`).
- **Wrapped in try/catch in the observer**: a thrown exception in the evaluator MUST NOT swallow the attendance record create. The observer catches and reports.
- **Anonymisation does not apply**: there is no opt-out for achievements. They are tied to public-profile visibility (`users.profile_is_public`) — if the profile is hidden, the achievements are hidden along with it.
- **Time-based kinds use a daily cron** because no incoming event would naturally evaluate them — a 30-day streak resets at midnight UTC with no user action.
