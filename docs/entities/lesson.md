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
| `duration_minutes` | smallint unsigned | nullable | **Snapshot** of the class's length (#1591). Null when the class never set one; mat hours then fall back to 90 minutes rather than storing a guess |
| `kind` | varchar(8) | not null | **Snapshot**, `App\Enums\TrainingMode` ([table](./academy-class.md#enum--trainingmode-1803)). Holds values up to 10 characters; SQLite does not enforce the declared length (#1803) |
| `notes` | text | nullable | Free text about the evening. Never parsed into topics — notes are for "Marco's first day back", not for data entry |
| `created_at` / `updated_at` | timestamp | nullable | |

### Indexes

- `UNIQUE(academy_class_id, held_on)` — one occurrence per class per day. The check-in fires one POST per tap and two taps in quick succession arrive together; both would see no lesson and both would insert. This index rejects the second, and `firstOrCreate` catches exactly that violation and re-reads the winner. NULL class ids are distinct to both engines, so class-less lessons (a future one-off seminar) are not constrained by it.
- `INDEX(academy_id, held_on)` — "this academy's lessons in this window", the read every coverage question starts from.

### The snapshot is the point

`name`, `starts_at`, `duration_minutes` and `kind` are copied from the class once and never re-read. The timetable is mutable and the past is not: moving Tuesday fundamentals to Wednesday must not rewrite what happened on every previous Tuesday. [`academy_schedules`](./academy-schedule.md) (#1094) solved the same problem with a history table; a lesson is an *event*, so it carries its own truth and skips the table.

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
- **A plan whose day has passed is unconfirmed, not taught (#1858).** The season map (`GET /api/v1/stats/syllabus/calendar`) splits the lessons that are not held in two, on the server's today: dated today or later is **planned**, earlier is **unconfirmed** — a plan nobody checked into. Tonight's lesson with nobody checked in yet is still planned. Neither is stored, and nothing deletes an unconfirmed plan: it is shown as such, not counted, and not treated as a failure.
- **The week's plan for the group names planned lessons only (#1863).** The season map's "copy the week's plan" builds plain text from the same payload on the client. It covers the week of the server's today, or the next week once nothing is left planned in this one. It prints one line per **planned** lesson, with each technique under its position. A held lesson has already happened, and an unconfirmed one is no longer a plan. The class and topic names are the programme's own, untranslated, and the message covers the whole academy whatever filter the map is showing, because the group is every athlete. When neither week has a plan, there is no message.
- **A plan lands on a day the class runs (#1859).** Planning reaches any week of the season (the timetable's stepper, the season map), so the two writes under `/api/v1/lessons` refuse a **new** lesson dated today or later that does not fall on the class's weekday (`ResolvesLessonSlot::futureSlotOnClassWeekday()`, a 422 on `held_on`). A wrong date would otherwise create a plan nobody is ever checked into. The past keeps no rule — backfill has had no floor since #181, and a class can have changed weekday since the evening being recorded — and neither does a lesson that **already exists**, so a plan made before its class moved day can still be edited or cleared. No pending calendar change can move a class's day under a plan: while the academy has a class, the timetable supersedes planned schedule changes (#1575, [`academy-schedule.md`](./academy-schedule.md)).
- **A lesson may now be created without attendance.** Since #1564 the two writes under `/api/v1/lessons` materialise it, which is how a plan exists at all — the row is the plan. Reads still never create one.
- **The list is one list.** Topics attached ahead of time are the plan; the same list is editable after the fact ("we did X instead"). One place to edit it, so the record and the plan can never disagree.
- **An unattributed presence joins the lesson when the owner names the session (#1590).** A presence carries `lesson_id = null` when it was recorded without a class in hand: before the timetable existed, from the daily view with no class picked, or by the athlete's self-mark. The check-in screen has always shown such a row under whichever session you are looking at, but `held` asks the stricter question — does any attendance row point at *this* lesson — so a tagged session full of people used to read as never held and coverage reported nothing taught. Two writes settle it: `MarkAttendanceAction` adopts the named athletes' unattributed rows into the class it was given, and `SetLessonTopicsAction` adopts the whole day's via `AdoptUnattributedAttendanceAction`. Tagging is the owner saying which session they mean, so it is the right moment to settle the attribution the screen was already implying.
- **The adoption only fires when the day had one session to be at.** `AdoptUnattributedAttendanceAction` refuses on two counts: more than one class for that **weekday**, or more than one **lesson** on that date. A presence that names neither of two evening classes could have been at either, and a guess is indistinguishable from a fact afterwards. Both checks are needed. The weekday count comes from the timetable, because lessons are materialised one at a time and the first one tagged would otherwise always look unique; the lesson count catches the opposite case, a class deleted or moved off its weekday since that evening, which leaves nothing in the timetable to count (`AcademyClass` is hard-deleted). The weekday is Carbon's `dayOfWeek`, 0=Sun..6=Sat, matching the column — reading it as ISO agrees six days in seven and fails open on Sunday, where no stored row can equal 7.
- **An athlete already naming the lesson is never given a second presence**, and one already naming *another* lesson is never reassigned. The `MarkAttendanceAction` path needs no ambiguity guard: the owner has explicitly submitted those athletes for that class.
- **What to teach next is derived, never stored (#1566).** `SuggestLessonTopicsAction` ranks the programme by three rules in order — never taught this season, taught once, least recently taught — and every row carries which rule produced it. It reads the *same* definition of held and of the season that `SyllabusCoverageAction` does, deliberately: a topic the chart calls thin and the suggestion calls covered would make one of the two screens a liar, and a test pins them together rather than trusting a comment. Scoped to the class's `kind` by `TrainingMode::admittedTopicModes()` — a mode admits itself and `both`, while `both` and `other` admit everything — so a gi class is never told to teach a no-gi technique, nor a kata class a kumite drill; positions are never suggested, because "teach closed guard tonight" is not an answer.
- **What tonight's room missed is derived from the room (#1860).** `RoomGapsAction` reads the athletes checked into this lesson against the techniques the suggestions would consider (`SyllabusTopic::scopeTeachableIn()`, the one definition both share) minus what tonight already names, taught in held lessons this season **before tonight** — by the clock: an earlier lesson the same day counts, a later one that evening does not. A technique comes back when at least two of the people present, and at least half of them, were at none of its lessons after joining. At most three, the most missed first, and nothing for fewer than three people on the mat. It sharpens the suggestions rather than repeating them: a technique covered twice can still have been missed by most of tonight's room. A presence on one of those days that names no lesson is counted apart (`unattributed`), never as an absence (#1590). The names are listed in register order and nothing is counted per person.
- **The notes of the last evening that taught a technique (#1862).** The lesson sheet shows, beside a technique, the notes of the latest **held** lesson that named it and carried notes (blank ones skipped). They are still never parsed: `LastLessonNotesAction` finds a lesson, not a sentence, and the sheet labels them as that evening's notes with its date and class — "Marco's first day back" read as a note on the armbar would be a lie. A plan never counts, for the same reason it never counts as taught. And only evenings **before** the one the sheet is open on answer: tonight's plan becomes held the moment somebody is checked in, and its note ("add the belly-down finish") would otherwise stand in for the real previous notes. Two classes on the same earlier evening: the later one answers.
- **Deleting a class does not delete its lessons.** `academy_class_id` goes null; everything else stays.
- **No soft deletes, yet.** Nothing in this milestone removes a lesson. Deleting one nulls `attendance_records.lesson_id` (never cascades — removing a lesson must never remove the people who were there).

## What a lesson covered — `lesson_topic`

The join between the timetable and the programme (#1564), and the row the coverage view counts.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `lesson_id` | bigint unsigned | FK `lessons.id`, cascade on delete, part of PK | |
| `syllabus_topic_id` | bigint unsigned | FK `syllabus_topics.id`, cascade on delete, part of PK | |

- `PRIMARY KEY(lesson_id, syllabus_topic_id)` — no surrogate key and no timestamps: a link is the fact, it has no identity of its own and nothing about it changes. The composite key is also what makes attaching the same topic twice a no-op at the schema level rather than a rule the code has to remember.
- `INDEX(syllabus_topic_id)` — the reverse read, "which lessons covered this topic", is what #1565, #1567 and #1745 ask; the composite key only indexes the other direction.
- **Who was in the room when a topic was taught** is one join, written once: `App\Support\TopicAttendance` returns the held lessons that named a set of topics, each with the distinct living athletes present — a deleted athlete's presences still make a lesson held, but the person is counted nowhere a list of people is shown (#1746). One evening is one exposure, however many topics it named. The technique drill-down (#1745), tonight's room (#1860) and the coverage report's reach (#1746) read it.
- **A topic that leaves the programme keeps its links.** Topics are soft-deleted, so the FK cascade (a *hard*-delete rule) never fires for them. `SetLessonTopicsAction` also carries already-attached departed topics through every `sync()`: the picker cannot offer them, so a sync of what it offers would quietly drop them and editing tonight's list would rewrite what March said.
- **A position is a legitimate tag.** Tagging "Half guard" tags the position, not its children — "we worked half guard" is what an instructor actually says.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/lessons?academy_class_id=&held_on=` | The lesson in that slot with its topics, or `null`. Never creates one. `attendance_read` |
| `PUT` | `/api/v1/lessons/topics` | `{academy_class_id, held_on, topic_ids[]}` — materialises and syncs. An empty list takes the last topic off. `attendance_record` |
| `PUT` | `/api/v1/lessons/notes` | `{academy_class_id, held_on, notes}` — free text, never parsed into topics. `attendance_record` |
| `GET` | `/api/v1/lessons/recent-topics` | What the academy taught lately, most recent first — the picker's second group. `attendance_read` |
| `GET` | `/api/v1/lessons/room-gaps?academy_class_id=&held_on=` | What most of the people checked into this lesson missed, of what was already taught this season (#1860). Never creates one. `attendance_read` |
| `GET` | `/api/v1/lessons/last-notes?syllabus_topic_id=&before=` | The latest **held** lesson before `before` (the day the sheet is open on) that named the topic and carried notes, or `null` (#1862). A living topic of the caller's academy, else 422. `attendance_read` |

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
