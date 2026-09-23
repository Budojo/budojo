# Entity — `AcademyClass`

## Purpose

One recurring slot on an academy's weekly timetable (#1562): *"Fundamentals, Monday, 19:00, gi."*

Until this table Budojo knew when an academy trains as a weekday bitmap (`academy_schedules.training_days`) and nothing more. An academy running kids at 17:00 and adults at 19:00 on the same Monday had one undifferentiated bucket for both, so "who was at the kids' class" could not be asked, and there was nothing for a lesson's topics to attach to.

A class is **mutable** — timetables change. The past is protected not by a history table but by each [`Lesson`](./lesson.md) copying the class's name, time and kind at creation and never re-reading them.

Nothing here is mandatory. An academy that never opens the timetable keeps checking people in by the day, exactly as before.

## Schema — `academy_classes`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owner academy |
| `name` | varchar(60) | not null | The owner's own word for it — "Fundamentals", "Kids", "Open mat" |
| `weekday` | tinyint unsigned | not null, 0–6 | Carbon `dayOfWeek`: 0 = Sunday … 6 = Saturday. Same convention as `training_days`, so the two never need translating |
| `starts_at` | varchar(5) | nullable | `HH:MM`, 24-hour. Text rather than `TIME`: MySQL would return `19:00:00` and SQLite whatever was written, and every reader would then trim one and not the other. Zero-padded text sorts correctly as a string. Null = the class has no fixed time |
| `duration_minutes` | smallint unsigned | nullable, 15–480 | |
| `kind` | varchar(8) | not null | `App\Enums\TrainingMode` — see below. Declared 8 and holding values up to 10 (`tachi-waza`): SQLite does not enforce a declared length, so no table rebuild widens it (#1803) |
| `created_at` / `updated_at` | timestamp | nullable | |

### Indexes

- `INDEX(academy_id, weekday)` — the hot read is "this academy's week", and the check-in narrows it to one weekday.

### Enum — `TrainingMode` (#1803)

One vocabulary for every martial art, shared with [`Lesson`](./lesson.md) and [`SyllabusTopic`](./syllabus-topic.md). It replaced `ClassKind` and `TopicKind`, keeping their stored values.

| Case | Value | Martial art | Meaning |
|---|---|---|---|
| `Gi` | `gi` | BJJ | Trained in the kimono — lapel guards, collar chokes |
| `NoGi` | `nogi` | BJJ | Trained without — heel hooks, K guard |
| `TachiWaza` | `tachi-waza` | Judo | Standing — nage-waza, the throws |
| `NeWaza` | `ne-waza` | Judo | On the ground — katame-waza, pins, chokes, locks |
| `Kata` | `kata` | Karate | Forms |
| `Kumite` | `kumite` | Karate | Sparring |
| `Poomsae` | `poomsae` | Taekwondo | Forms |
| `Kyorugi` | `kyorugi` | Taekwondo | Sparring |
| `Both` | `both` | every art | Either way — a mixed class, karate's kihon, a technique that belongs to both halves |
| `Other` | `other` | every art, **classes only** | On the timetable without being the martial art — conditioning, wrestling, a yoga slot |

The kind is a dimension of the **class**, not a tag on a lesson: heel hooks live in no-gi, lapel guards in gi, and a coverage chart that mixes the two says a number that is quietly wrong. Every art splits the same way, two modes and a middle. It is copied onto every lesson the class produces.

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::classes()`
- `hasMany(Lesson::class)` — every occurrence this slot has produced

## Business rules

- **Ordering.** `GET /api/v1/academy/classes` returns the week by `weekday`, then `starts_at`, with untimed classes last within their day, then `name`.
- **A class is in one of its academy's modes (#1803).** `kind` must be one of `MartialArtProfile::classModes()` for the academy's martial art: its two training modes, `both` or `other`. A `gi` class in a karate academy is a 422, on create and on update. The art cannot change under an existing class — classes lock it (see [`academy.md`](./academy.md)).
- **Editing never rewrites the past.** Changing a class's name, day, time or kind touches only future materialisations. Every existing [`Lesson`](./lesson.md) keeps the snapshot it was created with.
- **Deleting keeps the lessons.** The FK on `lessons.academy_class_id` is `nullOnDelete`: the occurrences stay, under the name they were held as. Removing next week's slot must never remove the evenings people trained.
- **Weekday mismatch is allowed on purpose.** A lesson can be materialised for a class on a date that is not the class's weekday — the Monday class held on Tuesday because of a holiday is a real thing. The check-in only *offers* the date's weekday classes; the API does not refuse others.
- **Capability.** Reads need `academy_settings_read` (every role); writes need `academy_settings_update` (owner, admin) — the same gate as the training days and the price list. An instructor who records attendance does not thereby get to move the class they teach.
- **The training days follow the timetable (#1575).** While at least one class exists, `academies.training_days` is the set of weekdays with a class, recomputed after every class is saved or deleted (`AcademyClassObserver` → `DeriveTrainingDaysFromTimetableAction` → `RecordTrainingDaysAction`, the same path the owner's PATCH takes, so [`academy_schedules`](./academy-schedule.md) gets its row). Deleting the last class leaves the days as they were.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/academy/classes` | The whole week |
| `POST` | `/api/v1/academy/classes` | `name`, `weekday`, `kind` required; `starts_at`, `duration_minutes` optional |
| `PATCH` | `/api/v1/academy/classes/{academyClass}` | Partial — only the fields sent change |
| `DELETE` | `/api/v1/academy/classes/{academyClass}` | 204; lessons survive |

`AcademyResource` also carries `classes_count` so the academy page can say "4 classes a week" without a second request. Full shapes in [`../api/v1.yaml`](../api/v1.yaml) § `AcademyClass`.

## Related

- [`lesson.md`](./lesson.md) — what a class becomes on a given date
- [`attendance-record.md`](./attendance-record.md) — points at the lesson, not the class
- [`academy-schedule.md`](./academy-schedule.md) — the weekday bitmap this generalises; still drives the date picker and the expected-attendance denominators
- Epic #1561 — what was taught, and what is still missing
