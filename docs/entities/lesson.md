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

The copy is taken **when the row is created**. Until #1564 that was always the day itself, because a lesson only existed once somebody had been checked into it; a planned lesson is created earlier, so one planned on Monday for Wednesday keeps Monday's name even if the class is renamed on Tuesday. Deliberate — re-reading the class would mean the snapshot is not a snapshot — and the window in which it can drift is a plan nobody has taught yet.

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::lessons()`
- `belongsTo(AcademyClass::class)` — nullable
- `hasMany(AttendanceRecord::class)` — who was there
- `belongsToMany(SyllabusTopic::class, 'lesson_topic')` — what it covered (#1564). Carries `withTrashed()`: a topic taken out of the programme must still name itself on the lessons that taught it. See [`syllabus-topic.md`](./syllabus-topic.md)

## Business rules

- **Materialised on the first mark, reused after.** `MarkAttendanceAction` with an `academy_class_id` calls `MaterialiseLessonAction` inside the same transaction as the inserts, so a lesson cannot exist because inserts that then failed asked for it.
- **A GET never creates one.** `GET /api/v1/attendance?academy_class_id=` looks the lesson up; if nobody has been checked in yet it simply finds none and returns only the day's class-less presences.
- **Held vs planned, and nothing stores the difference (#1564).** A lesson is **held** when at least one `AttendanceRecord` points at it, and **planned** otherwise. `LessonResource.held` derives it on every read. The known failure mode of a plan-then-confirm flow is that nobody ever confirms and the chart then reports the plan as truth; here the check-in *is* the confirmation, so there is no step to remember and no flag to go stale. The coverage view (#1565) counts held lessons only.
- **A lesson may now be created without attendance.** Since #1564 the two writes under `/api/v1/lessons` materialise it, which is how a plan exists at all — the row is the plan. Reads still never create one.
- **The list is one list.** Topics attached ahead of time are the plan; the same list is editable after the fact ("we did X instead"). One place to edit it, so the record and the plan can never disagree.
- **Deleting a class does not delete its lessons.** `academy_class_id` goes null; everything else stays.
- **No soft deletes, yet.** Nothing in this milestone removes a lesson. Deleting one nulls `attendance_records.lesson_id` (never cascades — removing a lesson must never remove the people who were there).

## What a lesson covered — `lesson_topic`

The join between the timetable and the programme (#1564), and the row the coverage view counts.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `lesson_id` | bigint unsigned | FK `lessons.id`, cascade on delete, part of PK | |
| `syllabus_topic_id` | bigint unsigned | FK `syllabus_topics.id`, cascade on delete, part of PK | |

- `PRIMARY KEY(lesson_id, syllabus_topic_id)` — no surrogate key and no timestamps: a link is the fact, it has no identity of its own and nothing about it changes. The composite key is also what makes attaching the same topic twice a no-op at the schema level rather than a rule the code has to remember.
- `INDEX(syllabus_topic_id)` — the reverse read, "which lessons covered this topic", is what #1565 and #1567 both ask; the composite key only indexes the other direction.
- **A topic that leaves the programme keeps its links.** Topics are soft-deleted, so the FK cascade (a *hard*-delete rule) never fires for them. `SetLessonTopicsAction` also carries already-attached departed topics through every `sync()`: the picker cannot offer them, so a sync of what it offers would quietly drop them and editing tonight's list would rewrite what March said.
- **A position is a legitimate tag.** Tagging "Half guard" tags the position, not its children — "we worked half guard" is what an instructor actually says.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/lessons?academy_class_id=&held_on=` | The lesson in that slot with its topics, or `null`. Never creates one. `attendance_read` |
| `PUT` | `/api/v1/lessons/topics` | `{academy_class_id, held_on, topic_ids[]}` — materialises and syncs. An empty list takes the last topic off. `attendance_record` |
| `PUT` | `/api/v1/lessons/notes` | `{academy_class_id, held_on, notes}` — free text, never parsed into topics. `attendance_record` |
| `GET` | `/api/v1/lessons/recent-topics` | What the academy taught lately, most recent first — the picker's second group. `attendance_read` |

A lesson is addressed by its **slot** — the class, and the day — rather than by an id, because when the owner is planning it the row does not exist yet.

Writes are gated on `attendance_record` and not on `academy_settings_update`: writing down what was taught is the same act of witness as writing down who was there, and the instructor who ran the class is the one who knows. Editing the programme itself stays a settings job.

Lessons also surface through:

- `attendance_records.lesson_id` on every `AttendanceRecord` — see [`attendance-record.md`](./attendance-record.md)
- `academy_class_id` on `GET`/`POST /api/v1/attendance` — the check-in speaks in classes, the server resolves the lesson

## Related

- [`academy-class.md`](./academy-class.md) — the recurring slot this is an occurrence of
- [`attendance-record.md`](./attendance-record.md) — the presences recorded into it
- [`syllabus-topic.md`](./syllabus-topic.md) — the programme these topics come from
- Epic #1561 — what was taught, and what is still missing; #1565 (coverage), #1566 (what next), #1567 (per athlete)
