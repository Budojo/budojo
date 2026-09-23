# Entity — `SyllabusTopic`

## Purpose

One entry in an academy's programme (#1563): a **position** when `parent_id` is null (*"Closed guard"*), a **technique** under it otherwise (*"Armbar"*). The tree is the denominator the coverage view (#1565) measures against — "twelve armbars" is neither a lot nor a little; "twelve of the forty things I said I'd teach this year" is a number an instructor can act on.

Two failure modes bracket the design. Free text, and within three months the data is `armbar`, `arm bar`, `juji gatame`, `leva al braccio` — four tags, one technique, a worthless chart. A fixed shipped list, and something is always missing, because every academy teaches its own way. So: a **shipped seed, fully editable**. The BJJ starter (`server/database/seed-data/syllabus/bjj.json`) is copied into rows the academy owns from the first minute; the file is never read again for them.

The parent is the **position**, not the submission, on purpose: *"you have done nothing from half guard all year"* is information an instructor acts on, *"few kimuras"* is not. A few submissions therefore appear under several positions — an armbar from mount and one from closed guard are different lessons, and a chart must tell them apart. That repetition is the design.

## Schema — `syllabus_topics`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owner academy. Rows are per-academy, never global, so editing is unconstrained |
| `parent_id` | bigint unsigned | nullable, FK `syllabus_topics.id`, cascade on delete | Null = position, set = technique. **Exactly two levels** — the request refuses a parent that has a parent |
| `name` | varchar(80) | not null | The owner's own word for it |
| `kind` | varchar(8) | not null | `App\Enums\TrainingMode` — see below. Holds values up to 10 characters; SQLite does not enforce the declared length (#1803) |
| `in_season` | boolean | not null, default `true` | In scope for the current season. This is the coverage denominator; the owner unticks what they don't teach this year |
| `sort_order` | smallint unsigned | not null, default `0` | Order among siblings. New topics append; `PATCH` moves |
| `created_at` / `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable | Soft delete — see business rules |

### Indexes

- `INDEX(academy_id, parent_id, sort_order)` — the hot read is one academy's tree, siblings in order.

### Enum — `TrainingMode` (#1803)

The same enum as [`AcademyClass`](./academy-class.md#enum--trainingmode-1803)'s, which lists every case. A topic uses the academy's two modes and `both`, never `other`: a topic is the martial art by definition, so there is nothing else for it to be. A technique's kind defaults to its position's in the seed; the owner can set either.

## Relations

- `belongsTo(Academy::class)` — inverse of `Academy::syllabusTopics()`
- `belongsTo(SyllabusTopic::class, 'parent_id')` — `parent()`, null on a position
- `hasMany(SyllabusTopic::class, 'parent_id')` — `children()`, ordered by `sort_order` then `name`; empty on a technique
- `scopePositions()` — the top level
- Inverse of `Lesson::topics()` through `lesson_topic` (#1564) — every lesson that covered this topic

## Business rules

- **Two levels, enforced at the boundary.** `POST` accepts `parent_id` only when it names one of the caller's academy's *positions* (living, `parent_id IS NULL`); a technique as parent, a foreign one and a deleted one all fail the same `exists` rule. `PATCH` does not accept `parent_id` at all — moving a technique is a delete and an add, and a position cannot become a technique without taking its children somewhere.
- **Unique among living siblings.** The same name twice under one position is the free-text drift the tree exists to prevent; the same name under another position is the design. Deleted rows do not hold a name.
- **Appended, then reordered.** `CreateSyllabusTopicAction` places a new topic after its siblings; `sort_order` on `PATCH` moves it. Drag-to-reorder is not a v1 requirement — a sort field is enough.
- **A topic is in one of its academy's modes (#1803).** `kind` must be one of `MartialArtProfile::topicModes()` — the art's two training modes or `both`. Anything else is a 422, on create and on update. A shipped programme is held to the same rule when it is parsed: a mode its art does not have fails the seed and the guard test, before a single row is written.
- **`in_season` on a position cascades.** `UpdateSyllabusTopicAction` copies the flag to every technique under the position — unticking "Lapel guards" in one tap is the difference between an owner who narrows the seed and one who abandons it. Nothing else cascades: a position's kind is a default for what is added under it, not a rule over what is already there. Unticking one technique leaves its position and siblings alone.
- **Soft delete, whole subtree.** `DeleteSyllabusTopicAction` soft-deletes a position together with its techniques. Soft, because a lesson that taught the topic (#1564) must still be able to say so; the subtree, because a technique whose position is gone has nowhere in the tree to be. Route binding is on living rows, so a deleted topic is a 404 to `PATCH` and `DELETE`, and the tree and the count never show it.
- **The seed is on demand and never overwrites.** `POST /academy/syllabus/seed` copies the shipped programme into the academy — only when the academy has **no** topics at all. Even one topic is a programme the academy owns, and the request is a 409. Not run at academy creation: a programme is a claim about what the academy teaches, and the button says so.
- **Capability.** Reads need `academy_settings_read` (every role); writes and the seed need `academy_settings_update` (owner, admin) — the same gate as the timetable and the price list.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/academy/syllabus` | The tree: positions in order, each with `children` |
| `POST` | `/api/v1/academy/syllabus` | `name`, `kind` required; `parent_id` (a position) and `in_season` optional |
| `POST` | `/api/v1/academy/syllabus/seed` | Copy one of the martial art's starter programmes (#1800). Optional `programme` key — required when the art offers several; 201 `{ written }`, 404 when the art offers none yet, 409 when the academy already has topics, 422 for a key it does not offer |
| `PATCH` | `/api/v1/academy/syllabus/{syllabusTopic}` | Partial — `name`, `kind`, `in_season`, `sort_order` |
| `DELETE` | `/api/v1/academy/syllabus/{syllabusTopic}` | 204; soft, subtree |

`AcademyResource` also carries `syllabus_topics_count` — the living **techniques**, not positions, so the academy page can say "84 techniques" or "not set up yet" without a second request. Full shapes in [`../api/v1.yaml`](../api/v1.yaml) § `SyllabusTopic`.

## The shipped seed

**Starter programmes are per martial art (#1800).** Each art's registry (`server/database/seed-data/martial-arts/<art>.json`) lists the programmes it offers as `{ key, file }`, and the files live in `server/database/seed-data/syllabus/`. The seed endpoint takes the key; the academy resource lists the keys as `syllabus_programmes`. An art lists **none** until its first programme ships — the endpoint answers 404 and the programme page offers no button — and **more than one** when the art is taught in styles with different kata (karate: one programme per style, so the key is required and the button names the style). The chosen key is not stored: the rows are the academy's from that moment.

`syllabus/bjj.json` — the BJJ starter (key `bjj`): a list of positions, each with a `kind` and its `techniques` (a string, or `{ name, kind }` when the technique's kind differs from the position's). Ordered the way a lesson is: from standing, down through the guard, into the pins, out through the escapes, then the leg entanglements, the submission families across positions, and practice — self-defence last. Gi and no-gi both present; no kids programme. `SyllabusSeedTest` guards every programme file: it parses, every position is named once, no position repeats a technique, every kind is a mode of the file's own martial art.

`syllabus/judo.json` — the judo starter (key `judo`, #1804): 14 groups and 137 items, where a position is a **group** — *"no ne-waza all year"* is what a judo instructor acts on. The eight technique groups are the Kodokan classification as revised on 1 April 2017, name for name: te-waza 16, koshi-waza 10, ashi-waza 21, ma-sutemi-waza 5 and yoko-sutemi-waza 16 (the 68 nage-waza, all `tachi-waza`); osaekomi-waza 10, shime-waza 12 and kansetsu-waza 10 (the 32 katame-waza, all `ne-waza`). Around them, in the order a class runs: ukemi and kumi-kata / tai-sabaki first, renraku-waza and kaeshi-waza after the throws, ne-waza transitions after the locks, then randori and shiai, and the seven Kodokan kata last. The four techniques shiai forbids (kani-basami, kawazu-gake, do-jime, ashi-garami) are in, named *(prohibited in shiai)*: they are taught for knowledge, and ashi-garami is in Katame-no-kata. Romanised without macrons, as the IJF writes them, and never translated — an instructor says *o-soto-gari*.

`syllabus/karate-goju-ryu.json` — the first karate starter (key `karate-goju-ryu`, #1805). **Karate ships one programme per style**, because kihon and kumite are broadly shared between styles and kata are not: a karate school is known by its kata, and a Shotokan dojo handed Goju kata would unlearn the list rather than own it. The button names the style ("Start from the Goju-ryu programme"). 15 groups, 62 items: junbi and hojo undo, kihon (dachi, uke, tsuki and uchi, geri, kihon ido), the kata families — heishu (Sanchin, Tensho), fukyu, kaishu for kyu and for dan — then bunkai, kakie and kumite. Kata are `kata`; kakie and every kumite form `kumite`; conditioning, kihon and bunkai `both` — kihon is the middle, not a third mode. Two lineages open differently: Okinawan Goju-ryu (IOGKF, Jundokan) with Gekisai, the Japanese Goju-Kai with five Taikyoku. One file serves both — the fukyu kata are two groups, Taikyoku and Gekisai, so a school takes the lineage it does not teach out of season in one tap. Kaishu kata in the Okinawan order, Seiyunchin → Shisochin → Sanseiru, which is also the order of the FIJLKAM Goju dan programme; spelled as the IOGKF spells them (Sanseiru, Sepai; Goju-Kai writes Seienchin and Seipai).

## Related

- [`academy-class.md`](./academy-class.md) — the timetable; its classes share the `TrainingMode` vocabulary, and the table of cases lives there
- [`lesson.md`](./lesson.md) — the lessons that covered these topics, through `lesson_topic` (#1564)
- Epic #1561 — what was taught, and what is still missing
