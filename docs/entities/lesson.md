# Entity — `Lesson`

## Purpose

One real occurrence of a class on one date (#1562) — *"Fundamentals, Monday 14 September 2026, 19:00."*

This is the row attendance points at, and the row topics will attach to (#1564). It is the unit the rest of the epic (#1561) is built on: "who was at the kids' class", "what did we cover in March", "what has Marco missed" are all questions asked of lessons.

A lesson is created **lazily**, by `App\Actions\Lesson\MaterialiseLessonAction`, the first time somebody is checked into it — never ahead of time. Pre-creating a year for four weekly classes would be two hundred rows per academy asserting something happened when it did not.

## Schema — `lessons`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owner academy |
| `academy_class_id` | bigint unsigned | FK `academy_classes.id`, **null on delete**, nullable | The slot this is an occurrence of. Null once the class was deleted — the snapshot below keeps the name |
| `held_on` | date | not null | Cast `date:Y-m-d`, like `attendance_records.attended_on`, so the SQLite TEXT path and the MySQL DATE path compare equal to the string a query hands them |
| `name` | varchar(60) | not null | **Snapshot** of the class's name at creation |
| `starts_at` | varchar(5) | nullable | **Snapshot**, `HH:MM` |
| `kind` | varchar(8) | not null | **Snapshot**, `App\Enums\ClassKind` |
| `notes` | text | nullable | Free text about the evening. Never parsed into topics — notes are for "Marco's first day back", not for data entry |
| `created_at` / `updated_at` | timestamp | nullable | |

### Indexes

- `UNIQUE(academy_class_id, held_on)` — one occurrence per class per day. The check-in fires one POST per tap and two taps in quick succession arrive together; both would see no lesson and both would insert. This index rejects the second, and `firstOrCreate` catches exactly that violation and re-reads the winner. NULL class ids are distinct to both engines, so class-less lessons (a future one-off seminar) are not constrained by it.
- `INDEX(academy_id, held_on)` — "this academy's lessons in this window", the read every coverage question starts from.

### The snapshot is the point

`name`, `starts_at` and `kind` are copied from the class once and never re-read. The timetable is mutable and the past is not: moving Tuesday fundamentals to Wednesday must not rewrite what happened on every previous Tuesday. [`academy_schedules`](./academy-schedule.md) (#1094) solved the same problem with a history table; a lesson is an *event*, so it carries its own truth and skips the table.

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::lessons()`
- `belongsTo(AcademyClass::class)` — nullable
- `hasMany(AttendanceRecord::class)` — who was there

## Business rules

- **Materialised on the first mark, reused after.** `MarkAttendanceAction` with an `academy_class_id` calls `MaterialiseLessonAction` inside the same transaction as the inserts, so a lesson cannot exist because inserts that then failed asked for it.
- **A GET never creates one.** `GET /api/v1/attendance?academy_class_id=` looks the lesson up; if nobody has been checked in yet it simply finds none and returns only the day's class-less presences.
- **Held vs planned.** In this milestone a lesson exists only because somebody attended it. #1564 adds planning ahead; from then on a lesson with topics and no attendance is *planned, not held*, and the coverage view (#1565) counts only held ones.
- **Deleting a class does not delete its lessons.** `academy_class_id` goes null; everything else stays.
- **No soft deletes, yet.** Nothing in this milestone removes a lesson. Deleting one nulls `attendance_records.lesson_id` (never cascades — removing a lesson must never remove the people who were there).

## API surface

No dedicated endpoints in this milestone. Lessons surface through:

- `attendance_records.lesson_id` on every `AttendanceRecord` — see [`attendance-record.md`](./attendance-record.md)
- `academy_class_id` on `GET`/`POST /api/v1/attendance` — the check-in speaks in classes, the server resolves the lesson

## Related

- [`academy-class.md`](./academy-class.md) — the recurring slot this is an occurrence of
- [`attendance-record.md`](./attendance-record.md) — the presences recorded into it
- Epic #1561 — what was taught, and what is still missing; #1564 (topics), #1565 (coverage), #1566 (what next)
