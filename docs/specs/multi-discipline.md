# PRD — Multi-discipline (#1799)

**Status**: kick-off. Nothing here has shipped. Every table marked **⚠️ draft** is
domain content and ships only after the owner has signed it off — ideally
against someone who teaches the discipline.

## Why

Budojo runs a Brazilian jiu-jitsu academy. Not by design — by default. The belt
ladder is the IBJJF one, the class kinds are gi and no-gi, the shipped programme
is sixty BJJ positions, the age divisions on the stats page are IBJJF divisions,
and the FAQ says "IBJJF scale" out loud. An owner who teaches karate opens the
athlete form and is offered a purple belt.

Nothing else in the product is BJJ. Attendance, fees, carnets, documents, the
timetable, the season, backups, the desktop shell — an instructor of any art
needs all of it and none of it knows what a kimono is. The name was already
right: *budō* is the martial way, not one style of it.

The owner wants to offer Budojo to friends who run karate and taekwondo courses.
Today that pitch dies at the belt picker.

## Goal

**The discipline is a property of the academy**, chosen once at setup. Every
place that today encodes BJJ reads the academy's discipline instead, and does
so from **one registry per discipline** — order of belts, stripe caps, training
modes, age divisions, the seed programme. Four disciplines at kick-off:

| Discipline | Value | Status |
|---|---|---|
| Brazilian jiu-jitsu | `bjj` | Today's behaviour, byte for byte. The default for every existing install. |
| Judo | `judo` | New |
| Karate | `karate` | New |
| Taekwondo | `taekwondo` | New — WT / Kukkiwon lineage, which is what FITA affiliates practise |

An existing install must not notice: no stored belt value changes, no label
moves, the BJJ sort order is the same twelve integers it is today.

## Non-goals

- **Per-athlete disciplines.** An athlete has one belt, in the academy's
  discipline. A dojo that teaches judo *and* karate, with an athlete holding a
  grade in each, is real and out of scope — see the first trade-off.
- **Custom ladders per academy.** Belts are a federation's rule; the programme
  is the academy's. See the third trade-off for the escape hatch.
- **Changing discipline on a populated academy.** Settable while the academy is
  empty, locked after. Every stored belt is a claim in the old ladder and there
  is no honest mapping from purple to anything in judo.
- **Karate style as a setting.** The karate programme seeds Shotokan kata as the
  most widespread and says so in the seed CTA; a Gōjū-ryū school edits the list,
  exactly as a BJJ school edits ours today.
- **ITF taekwondo.** Different patterns, different belt tips. WT only.
- **Wrestling, MMA, kickboxing, muay thai.** No belt ladder at all, or a
  federation-specific one nobody agrees on. That is a *nullable belt*, a
  different question from a fifth row in the table above, and it is not asked
  here.
- **Translating technique names.** The BJJ programme ships in English with the
  Portuguese and Japanese terms the sport uses; the others ship with the
  Japanese and Korean terms theirs use. The owner renames what they like.

---

## Trade-off: discipline on the academy vs grades per athlete

The general model is an `athlete_grades` table — `(athlete_id, discipline,
belt, stripes)` — with the academy declaring which disciplines it teaches. It
is the only model that represents a two-art dojo honestly.

**Rejected for this epic**, for weight of change rather than principle:

1. `athletes.belt` is read in about fifty files. Every roster row, sort, filter,
   badge, spine, promotion row, feed post, share card, public profile and CSV
   column would change *shape* (one belt → a list of belts), not just source.
2. Every existing academy is single-art, and so are the three the owner wants
   to sell to. The multi-art dojo is a real customer we do not have.
3. `AthletePromotion`, `belt_promotion` posts and achievements would all need a
   discipline dimension too, or a promotion in judo would celebrate as a belt
   promotion of the athlete's *karate* rank.

**Chosen:** `academies.discipline`, one value, and `athletes.belt` stays a
single column validated against that discipline's ladder.

**Escape hatch, written down so it is not re-derived:** the day a two-art dojo
is a real customer, add `athlete_grades`, backfill one row per athlete from
`(academy.discipline, athlete.belt, athlete.stripes)`, and make `athletes.belt`
a denormalised copy of the row in the academy's *primary* discipline — the way
`academies.training_days` is a cache of `academy_schedules` (#1094). Every
existing read keeps working during the migration.

## Trade-off: a closed `Belt` enum vs a string and a registry

Today `App\Enums\Belt` is twelve cases carrying `rank()` and `maxStripes()`. A
backed enum is closed at compile time, and the four ladders disagree on both
methods for the same colour: blue is rank 6 of 12 in BJJ and 4 of 6 in
taekwondo; red is the grand master in BJJ and the 2nd kup — *below* black — in
taekwondo; judo and karate have no purple at all.

Two ways out:

- **(a) Drop the enum.** `athletes.belt` becomes a free string checked against
  the ladder. Every `Belt` type-hint in ~15 server files and the literal union
  in ~40 client files becomes `string`.
- **(b) Keep the enum as a vocabulary of colours.** Add the cases the new
  ladders need, **remove** `rank()` and `maxStripes()` from it — those are not
  properties of a colour, they are properties of a colour *in a ladder* — and
  move them into a per-discipline `RankLadder`.

**Chosen: (b).** Type safety in fifty files survives; the model cast survives;
`AthletePromotion`, community payloads and the public profile keep working
unchanged; the client's literal union widens and stays a union. The DB values
already stored are all still cases. What (b) costs is a colour vocabulary that
contains belts no single discipline uses all of — which is what a vocabulary is.

**Two-tone belts** reuse the naming the coral belts introduced: `red-and-black`
and `red-and-white` exist today (#229), so the kids' half-belts are
`white-and-yellow`, `yellow-and-orange`, and so on. The first colour is the
upper half. They render through the `-a` / `-b` halves the spine already
composes (#1429) — the palette gains no new colour, only new pairs.

Taekwondo's 1st kup is red with black and is the same colour value as BJJ's 7th
degree: `red-and-black`. Same vocabulary entry, rank 10 of 12 in one ladder and
10 of 12 in the other by coincidence — and *label* "Red & black (7°)" in one and
"Red-black (1st kup)" in the other. That is exactly why labels are per
discipline (see FE behaviour) and ranks are per ladder.

## Trade-off: ladders per discipline vs per academy

The syllabus is seed-then-own — copied into rows the academy edits — because
every academy teaches its own programme. Should belts work the same way?

**No, not yet.** A belt order is a federation's rule; a karate school does not
decide that green comes before yellow. What *does* vary between schools is
whether the kids' half-belts are used and whether coloured belts carry stripes —
and both are answered by the ladder **including** the half-belts (a school that
does not use them never picks them) and by the cap being **per grade** (a school
that never awards a stripe on green never sees a picker offering one at cap 0).

**Escape hatch:** `academy_grades` — the ladder copied into rows on setup, same
pattern, same `409 when not empty` seed. Designed so `RankLadder::for(Academy)`
can read a table instead of a file without a caller noticing. Not built.

## Trade-off: generalise the gi / no-gi axis vs hide it

`ClassKind` and `TopicKind` exist because "a coverage chart that mixes heel
hooks and lapel guards says a number that is quietly wrong" (#1562). The cheap
option is to hide the picker for non-BJJ disciplines and store `both`.

**Rejected.** Every one of the three new disciplines has the *same* structural
split, and it is the first thing their instructors would look for on a coverage
chart:

| Discipline | Mode A | Mode B | The line it draws |
|---|---|---|---|
| BJJ | `gi` | `nogi` | lapel guards vs heel hooks |
| Judo | `tachi-waza` | `ne-waza` | standing (nage-waza) vs ground (katame-waza) |
| Karate | `kata` | `kumite` | forms vs sparring — kihon is `both` |
| Taekwondo | `poomsae` | `kyorugi` | forms vs sparring |

**Chosen:** the axis becomes the discipline's **training modes**. `both` and
`other` keep their meaning. A karate instructor who opens the check-in and is
offered "Gi" has already stopped listening; this is the difference between a
port and a product.

---

## Data model

### `academies.discipline`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `discipline` | varchar(16) | not null, **default `bjj`** | `App\Enums\Discipline`. The default is for the backfill of existing rows and a restored pre-discipline backup — the migration runs at desktop boot, so an old `budojo.sqlite` gets the column filled. **`POST /api/v1/academy` requires it**; the default never answers a request. |

No index — one academy per install.

### `App\Enums\Discipline`

`Bjj = 'bjj'`, `Judo = 'judo'`, `Karate = 'karate'`, `Taekwondo = 'taekwondo'`.
This one **is** a closed enum by nature: the set of disciplines Budojo ships a
ladder and a programme for is a product decision, and a value outside it has
no registry to read.

### The registry — `server/database/seed-data/disciplines/<discipline>.json`

One file per `Discipline` case, guarded by a test that every case has a file
and every file parses. Read through `App\Support\Discipline\DisciplineProfile`:

```php
final class DisciplineProfile
{
    public static function for(Discipline $discipline): self;   // cached per process

    public function ladder(): RankLadder;
    /** @return list<TrainingMode> */
    public function trainingModes(): array;
    /** @return list<array{code: string, category: 'kids'|'adults', min: int, max: int|null}> */
    public function ageDivisions(): array;
    public function syllabusSeed(): string;                       // path under seed-data/syllabus/
}

final class RankLadder
{
    /** @return list<Belt> in rank order */
    public function belts(): array;
    public function has(Belt $belt): bool;
    public function rankOf(Belt $belt): int;                      // 1-based position
    public function maxStripes(Belt $belt): int;
    public function first(): Belt;                                // what a new athlete gets
    public function sortCase(string $column, string $direction): string;
}
```

`Support`, not `Actions`: dependency-free helpers shared by ≥ 2 actions is the
canon's own example (`server/CLAUDE.md` § escape hatches). No Eloquent, no HTTP.

File shape:

```json
{
  "discipline": "judo",
  "grades": [
    { "belt": "white", "max_stripes": 0 },
    { "belt": "white-and-yellow", "max_stripes": 0, "kids": true },
    { "belt": "black", "max_stripes": 10 }
  ],
  "training_modes": ["tachi-waza", "ne-waza"],
  "age_divisions": [
    { "code": "bambini", "category": "kids", "min": 5, "max": 7 }
  ],
  "belt_synonyms": {
    "bianco-gialla": "white-and-yellow"
  },
  "syllabus_seed": "judo.json"
}
```

`kids: true` is informational — the picker groups them under a divider, nothing
validates on it. A school that never awards half-belts ignores the group.

### `App\Enums\Belt` — the vocabulary

Existing twelve cases stay, values untouched. New cases:

| Case | Value | Used by |
|---|---|---|
| `WhiteAndYellow` | `white-and-yellow` | judo, karate, taekwondo (9th kup) |
| `YellowAndOrange` | `yellow-and-orange` | judo, karate |
| `OrangeAndGreen` | `orange-and-green` | judo, karate |
| `GreenAndBlue` | `green-and-blue` | judo, karate, taekwondo (5th kup) |
| `BlueAndBrown` | `blue-and-brown` | judo, karate |
| `YellowAndGreen` | `yellow-and-green` | taekwondo (7th kup) |
| `BlueAndRed` | `blue-and-red` | taekwondo (3rd kup) |
| `BlackAndRed` | `black-and-red` | taekwondo — the *poom*, the under-15 black belt |

`rank()` and `maxStripes()` are **deleted** from the enum. Their two callers —
`applyBeltSort()` and `ValidatesStripesAgainstBelt` — read the ladder.

### Training modes

`ClassKind` and `TopicKind` become `App\Enums\TrainingMode` — one enum, the
union of every discipline's modes plus `both` and `other`, with the profile
saying which subset an academy may use (`other` is a class-only value, as
today). `academy_classes.kind`, `lessons.kind` and `syllabus_topics.kind` widen
from `varchar(8)` to `varchar(16)` (`tachi-waza` is ten characters); stored
values do not change. The column keeps its name — renaming it buys nothing and
touches three tables.

---

## ⚠️ Draft ladders — need sign-off

Rank is the 1-based position. `max_stripes` is the cap for **that grade**; at
`0` the stripe picker and the tiles do not render. "Stripes" on black are the
*dan* in every discipline; the noun is a client label per discipline
(`stripes.noun.<discipline>`), not a stored value.

### `bjj` — unchanged

Exactly today's `Belt::rank()` and `Belt::maxStripes()`: grey, yellow, orange,
green *(kids)*, white, blue, purple, brown, black *(cap 6)*, red-and-black,
red-and-white, red — cap 4 everywhere except black. A regression test pins the
generated ladder to these twelve integers so the refactor cannot move them.

### `judo` — FIJLKAM, with the half-belts Italian clubs award under 12

| # | Belt | Kids | Cap | Grade |
|---|---|---|---|---|
| 1 | `white` | | 0 | 6th kyu |
| 2 | `white-and-yellow` | ✓ | 0 | |
| 3 | `yellow` | | 0 | 5th kyu |
| 4 | `yellow-and-orange` | ✓ | 0 | |
| 5 | `orange` | | 0 | 4th kyu |
| 6 | `orange-and-green` | ✓ | 0 | |
| 7 | `green` | | 0 | 3rd kyu |
| 8 | `green-and-blue` | ✓ | 0 | |
| 9 | `blue` | | 0 | 2nd kyu |
| 10 | `blue-and-brown` | ✓ | 0 | |
| 11 | `brown` | | 0 | 1st kyu |
| 12 | `black` | | **10** | 1st–10th dan |
| 13 | `red-and-white` | | 0 | 6th–8th dan, worn by choice |
| 14 | `red` | | 0 | 9th–10th dan, worn by choice |

Open: a 6th dan is "black, 6 stripes" **or** "red-and-white" — both are what
the person actually wears. The ladder allows both; the owner picks. If that is
confusing in practice, drop rows 13–14.

### `karate` — FIJLKAM / WKF lineage, same half-belts

Identical to judo rows 1–12; no red-and-white or red. Cap 0 on coloured belts is
the open item most likely to be wrong: many Italian schools mark kids' progress
with stripes *between* exams. If the owner's karate friend says so, the cap on
coloured belts becomes 4 and nothing else moves.

### `taekwondo` — WT / FITA, ten kup

| # | Belt | Kids | Cap | Grade |
|---|---|---|---|---|
| 1 | `white` | | 0 | 10th kup |
| 2 | `white-and-yellow` | | 0 | 9th kup |
| 3 | `yellow` | | 0 | 8th kup |
| 4 | `yellow-and-green` | | 0 | 7th kup |
| 5 | `green` | | 0 | 6th kup |
| 6 | `green-and-blue` | | 0 | 5th kup |
| 7 | `blue` | | 0 | 4th kup |
| 8 | `blue-and-red` | | 0 | 3rd kup |
| 9 | `red` | | 0 | 2nd kup |
| 10 | `red-and-black` | | 0 | 1st kup |
| 11 | `black-and-red` | ✓ | 4 | *poom* 1st–4th, under 15 |
| 12 | `black` | | 9 | 1st–9th dan |

The 9th kup is "bianca superiore" in some clubs and "bianco-gialla" in others;
both describe a white belt with yellow on it, and the value is
`white-and-yellow` either way. The poom sits below black in rank so a roster
sorted by belt puts a 15-year-old who just converted next to the adults, not
above them.

## ⚠️ Draft training modes — need sign-off

The table in the fourth trade-off. Default for a **new class**: `gi` in BJJ (as
today), `both` elsewhere — a judo or karate class is mixed unless the owner says
otherwise. Default for a **new topic**: its position's mode, as today.

## ⚠️ Draft age divisions — need sign-off

Replaces the IBJJF constant in `AthleteAgeBandsAction::BANDS` with
`DisciplineProfile::ageDivisions()`. BJJ keeps the IBJJF table verbatim.

**Judo — FIJLKAM classes** *(verify against the current *Programma Attività*;
these move by a year between seasons)*: Bambini 5–7, Fanciulli 8–9, Ragazzi
10–11, Esordienti A 12, Esordienti B 13–14, Cadetti 15–17, Juniores 18–20,
Seniores 21–35, Master 36+.

**Karate — FIJLKAM / WKF**: Bambini 5–7, Fanciulli 8–9, Ragazzi 10–11,
Esordienti 12–13, Cadetti 14–15, Juniores 16–17, Under 21 18–20, Seniores 21–35,
Master 36+. Not the judo table — WKF's cadet is two years younger than IJF's.

**Taekwondo — WT / FITA**: Kids 5–8, Children 9–11, Cadetti 12–14, Juniores
15–17, Seniores 18–29, Master 30+.

Codes are lower-case ASCII (`esordienti_a`); labels are client i18n keys under
`stats.ageBands.<discipline>.<code>` through an explicit map, never a built
string.

## ⚠️ The programmes — need sign-off, one PR each

Same file shape as `bjj-syllabus.json`, moved to `seed-data/syllabus/<discipline>.json`
(the BJJ file moves too; `SeedSyllabusAction::SEED_FILE` becomes
`DisciplineProfile::syllabusSeed()`). Same guard test per file. Positions are
**groups**, because "you have done nothing from ne-waza all year" is what an
instructor acts on. Sizes below are targets, not counts.

- **Judo (~14 groups, ~120 techniques)** — Kōdōkan Gokyō plus katame-waza: ukemi;
  kumi-kata and tai-sabaki; te-waza (15); koshi-waza (10); ashi-waza (21);
  ma-sutemi-waza (5); yoko-sutemi-waza (16, the two forbidden ones included and
  marked); osaekomi-waza (10); shime-waza (12); kansetsu-waza (10); ne-waza
  transitions and turnovers; renraku and kaeshi-waza; randori and shiai
  preparation; Nage-no-kata and Katame-no-kata. Throws are `tachi-waza`,
  holds/chokes/locks are `ne-waza`, the rest `both`.
- **Karate (~12 groups, ~90 techniques)** — kihon, style-neutral: dachi (8),
  tsuki (6), uchi (6), uke (7), geri (8), combinations (5); **kata — Shotokan**:
  Heian 1–5, Tekki 1–3, Bassai-dai, Kankū-dai, Jion, Empi, Hangetsu, Gankaku,
  Jitte, and the advanced set to Gojūshiho — 26, all `kata`; kumite forms —
  gohon, sanbon, kihon-ippon, jiyū-ippon, jiyū — and WKF tactics (kizami-zuki,
  gyaku-zuki, ashi-barai, ura-mawashi, …), all `kumite`; self-defence;
  competition preparation. The seed CTA says "Shotokan" so nobody is surprised.
- **Taekwondo (~11 groups, ~70 techniques)** — seogi (6), hand techniques (6),
  makki (6), chagi (12); **poomsae**: Taegeuk 1–8 Jang and the yudanja set
  (Koryo, Keumgang, Taebaek, Pyongwon, Sipjin, Jitae, Cheonkwon, Hansu, Ilyeo),
  all `poomsae`; kyorugi footwork and attack/counter drills, all `kyorugi`;
  hosinsul; kyokpa; competition preparation (electronic scoring, rules).

---

## Business rules

- **Discipline is required at creation** (`POST /api/v1/academy`), one of the
  four values, 422 otherwise. The setup form always sends it; a fixture that
  does not is a fixture that fails.
- **Discipline is locked once the academy is not empty.** `PATCH /api/v1/academy`
  accepts `discipline` only while the academy has **no athletes (soft-deleted
  included), no classes and no syllabus topics**; otherwise 422 on the field.
  Soft-deleted athletes count because their belt is still a claim; classes
  count because their `kind` is a mode of the old discipline; topics because a
  BJJ programme inside a judo academy is a lie with a coverage chart. The
  precedent is the syllabus seed's 409: *a programme is a claim about what the
  academy teaches, and so is a discipline.*
- **A belt is valid for an athlete when the academy's ladder has it.**
  `AthleteFieldRules` becomes `AthleteFieldRules::for(Academy)`: `belt` is
  `Rule::enum(Belt::class)` **and** in `ladder->belts()`. The rule already has
  two callers (the form request and the CSV import), so a purple belt in a
  judo file is refused in the preview with the same reason the form would give.
- **Stripes are capped by the grade, in the ladder.** `ValidatesStripesAgainstBelt`
  reads `ladder->maxStripes($belt)`. The global ceiling on the request moves
  from `max:6` to `max:10` — the dan — and the DB column (unsigned tinyint)
  needs nothing.
- **The belt sort is generated, not hand-synced.** `applyBeltSort()` builds its
  two `CASE` expressions from `RankLadder::sortCase()`, values bound, `ELSE`
  strictly greater than the highest rank so a value outside the ladder surfaces
  at the end rather than hiding. `BeltRankSqlSyncTest` — which exists only to
  keep a string literal in step with an enum — is **retired** and replaced by a
  test that the BJJ ladder generates the twelve ranks it has today.
- **The owner who enrols themself gets the ladder's first belt**
  (`EnrollSelfAsAthleteAction`), not `Belt::White` — which is first in all four
  ladders today and is still not the rule.
- **The promotion backfill validates against the ladder too**
  (`StoreAthletePromotionRequest`: `from_belt`, `to_belt`, `belt_at_event`).
  Chain consistency (#1431) is untouched; it compares strings.
- **A promotion post, a share card and a public profile render with the
  discipline of the academy the belt was earned in.** `PublicProfileResource`
  and `CommunityPostResource` gain `discipline`; the client resolves label and
  colour through it, never through the *viewer's* academy. Moot on the desktop
  build — `community` and `athlete_accounts` are absent from its capability list
  (`server/config/budojo.php:77`) — and still correct on the web build.
- **The seed copies the academy's discipline's programme.** `POST /academy/syllabus/seed`
  reads `DisciplineProfile::for($academy->discipline)->syllabusSeed()`. The 409
  rule is unchanged.
- **Import synonyms resolve to the vocabulary, then the ladder validates.**
  `BeltText` gains the two-tone spellings (`bianco-gialla`, `bianco gialla`,
  `bianca/gialla`, `giallo-verde`, …). Resolution is discipline-independent —
  `blu` means `blue` everywhere — and the ladder check afterwards refuses what
  the academy does not award. The two steps stay two classes.

## API surface

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/v1/academy` | `discipline` **required**, `Discipline` enum |
| `PATCH` | `/api/v1/academy` | `discipline` accepted while empty; 422 `discipline` otherwise |
| `GET` | `/api/v1/academy` | `AcademyResource` gains `discipline`, `grades: [{ belt, max_stripes, kids }]` in rank order, `training_modes: [a, b]`, and `discipline_locked: bool` so the form can render the locked state without a failed PATCH |
| `GET` | `/api/v1/athletes`, `/{id}` | unchanged shape; `belt` may now be any vocabulary value |
| `POST` | `/api/v1/academy/syllabus/seed` | copies the discipline's programme |
| `GET` | `/api/v1/community/…`, `/public/…` | `discipline` beside every belt they emit |

OpenAPI: `Discipline` and `Grade` schemas; `Belt` enum extended and its
description rewritten — *a colour vocabulary; which colours an academy awards,
in what order and with what cap, is `Academy.grades`*; `TrainingMode` replaces
`ClassKind` / `TopicKind`; `Academy` properties; the 422 on `PATCH`.

Docs in the same PRs: `academy.md` (column, lock rule, the registry), `athlete.md`
(the enum table becomes a vocabulary table; validation is per ladder),
`athlete-promotion.md` (`belt_at_event` note), `academy-class.md` and
`syllabus-topic.md` (`TrainingMode`), `DESIGN_SYSTEM.md` (the belt palette, once).

## FE behaviour

### The ladder comes from the API; the labels do not

`AcademyService` exposes `discipline()`, `grades()` and `trainingModes()` as
computed signals off the loaded academy. **Order and caps are read from
`grades`** — `MAX_STRIPES_PER_BELT` and `BELT_ORDER` are deleted, not widened,
because a second copy of the ladder on the client is a second answer.

**Labels stay on the client** (they are UI copy, like `BELT_KEYS` today), as
one explicit two-level map so the i18n parity check can see every key:

```ts
GRADE_KEYS.common['white']            // 'grades.white'  — "White" / "Bianca", every discipline
GRADE_KEYS.bjj['green']               // 'grades.bjj.green' — "Green (kids)" / "Verde (bambini)"
GRADE_KEYS.bjj['red-and-black']       // 'grades.bjj.redAndBlack' — "Red & black (7°)"
GRADE_KEYS.taekwondo['black-and-red'] // 'grades.taekwondo.blackAndRed' — "Poom"
```

A discipline override wins; `common` answers otherwise. The twelve BJJ strings
are kept **character for character** — this is a rename of keys, not of copy.

### One belt palette

Three hex palettes exist today (badge SCSS, stats doughnut, share card) and
disagree on what blue is. They become **one**: the base colours as
`--budojo-belt-<colour>-{a,b,fg}` on `:root` in `budojo-theme.scss` (the one
sanctioned home for a domain palette, with its one-line comment), the badge and
spine composing two-tone belts from the halves exactly as the coral belts do
now, and the chart and the canvas card reading the same custom properties
through `getComputedStyle`. Ten colours, no new hex. The share card's
hard-coded `'RED & BLACK'` labels become the translated grade label, upper-cased
by CSS-equivalent logic in the canvas draw.

Two-tone belts need a contrast check per half: the badge text sits on both
halves, so `fg` must clear 4.5:1 against **both** `a` and `b`, in both themes.
`text-contrast.spec.ts` grows a case for every pair in the four ladders.

### Setup

`/setup` asks for the discipline **first** — before the name — as a
`p-selectbutton` of four options (Hick: four, not a dropdown; the choice frames
every field after it). Text labels only: `pi pi-*` has no martial-arts glyph
and the canon forbids a second icon family. The setup E2E (`setup.cy.ts`) picks
one; a second case picks judo and asserts the athlete form then offers
`white-and-yellow` and not `purple`.

### Academy page

The discipline shows as a read-only line while `discipline_locked` is true,
with a tooltip saying why ("Set while the academy has no athletes, classes or
programme"); as the same select-button while it is false. No dialog: the lock
is a fact about the data, not a warning to dismiss.

### Everywhere a belt is picked or sorted

The athlete form, the roster filter, the check-in render order, the promotions
list, the stats doughnut — each iterates `grades()` instead of `BELT_ORDER`.
The stripe picker renders `0…max_stripes` for the selected grade and hides at 0.
The sort toggle's copy "black → white" becomes "highest → lowest": true in all
four ladders, and it was the ranks, not the colours, that the sort meant.

### The stripe noun

`stripes.noun.<discipline>` — "stripes" / "gradi" for BJJ, "dan" for the other
three. Shown only where a cap is above zero, which outside BJJ is black and the
poom.

### Check-in, timetable, programme, lesson sheet, coverage filter

The mode picker and the coverage toggle iterate `trainingModes()`; labels
through `academy.trainingMode.<mode>`, an explicit map over the `TrainingMode`
union. BJJ shows exactly what it shows today.

---

## What does not change

Attendance and its heatmap; fees, tiers, the ledger, carnets and their
reconciliation; documents and expiry; the timetable's days and times; lessons
and the topics they covered (the `kind` column widens; no value moves); the
season; notifications; backup, Drive, folder; the desktop shell; achievements
(`belt_promotion` is a promotion in any art); the promotion history and its
chain rule; audit entries (`athlete.belt.promoted` stays the verb); search.

## Edge cases

- **Existing install, first launch after the update.** Migration adds
  `discipline = 'bjj'`. Every belt validates, every label is the same string
  under a renamed key, the sort produces the same order. The whats-new entry
  says so, because an owner reading "four disciplines" will look for what moved.
- **Restore from a backup taken before the column existed.** Same migration at
  boot, same default. Documented in `backup-restore.md` as "nothing to do".
- **A judo academy imports a CSV with `viola`.** The row is refused in the
  preview: *"viola is not a belt this academy awards"*, not a generic 422.
- **`PATCH discipline` on an academy with one soft-deleted athlete.** 422. The
  form never shows the control in that state, so this is the API guarding
  against a client that skipped the check.
- **A belt value in the DB that is not in the ladder** (a hand-edited file, a
  restore from another academy's backup). Renders through `common` labels and
  the colour palette — the vocabulary knows the colour even when the ladder
  does not — and sorts last. Not a crash.
- **A taekwondo poom holder turns 15.** The owner promotes `black-and-red` →
  `black`; the promotion history records a belt change, the feed celebrates
  it. That is what happens in the club too.
- **Coral belt stripes.** BJJ's `red-and-black` has cap 4 today and keeps it;
  taekwondo's `red-and-black` has cap 0. Same vocabulary entry, different
  ladders — which is the whole point of the second trade-off.
- **A share card for a two-tone belt.** The gradient the card draws from the
  belt colour uses half `a`; the label carries the full name.
- **`ELSE` in the generated `CASE`.** Always `count(ladder) + 1`, asserted by
  test, so a vocabulary value outside the ladder never collides with a real
  rank.

---

## Implementation slices

Order matters: slice 1 is the primitive every other slice reads. Slices 4–9 are
independent of each other once 1 has landed; 2 and 3 should land before any
programme ships, or the seed CTA for judo appears on an academy that still
picks BJJ belts.

### 1 — BE: the discipline and its ladder (#1800)

`Discipline` enum; `DisciplineProfile` + `RankLadder` + `TrainingMode`; the four
registry files (BJJ verbatim from today's enum; the other three as drafted
above, **signed off before merge**); migration `academies.discipline`;
`AcademyResource` fields; `POST` required / `PATCH` locked; `AthleteFieldRules::for()`;
`ValidatesStripesAgainstBelt` via ladder; `applyBeltSort()` generated;
`EnrollSelfAsAthleteAction` first belt; `StoreAthletePromotionRequest` ladder
check; `BeltText` two-tone synonyms; `Belt` gains eight cases and loses two
methods; factories pick from the academy's ladder; `SeedSyllabusAction` reads
the profile (BJJ file moved, content identical, guard test moved with it).
PEST: registry guard (every case has a file; parses; belts are cases; caps sane;
BJJ ladder equals the historical ranks), `CASE` generation and `ELSE`, 422
outside the ladder on form + import + promotion backfill, cap per grade, lock
rule for each of the three emptiness conditions, `POST` requires discipline.
Docs + OpenAPI in this PR.

### 2 — FE: belts drawn from the ladder (#1801)

`AcademyService` signals; `Belt` union widened; `MAX_STRIPES_PER_BELT` /
`BELT_ORDER` deleted; `GRADE_KEYS` two-level map + i18n keys (both locales, BJJ
strings unchanged); one belt palette in `budojo-theme.scss`, badge + spine
composing halves, doughnut and share card reading it; every picker/filter/sort
iterating `grades()`; stripe noun; `text-contrast.spec.ts` for the new pairs.
Visual verification: roster, form, check-in, promotions, stats, share card — for
all four ladders, light and dark, mobile and desktop.

### 3 — FE: choose the discipline at setup; see it on the academy page (#1802)

The select-button on `/setup`, the locked/unlocked control on the academy page,
`discipline_locked` consumed, i18n `disciplines.<value>`, `setup.cy.ts` +
`academy.cy.ts` cases.

### 4 — Training modes (#1803)

`TrainingMode` on the client; the mode picker on timetable, programme, lesson
sheet; the coverage toggle; the check-in class pick; `academy.trainingMode.*`
keys; column widening migration; `academy-class.md`, `syllabus-topic.md`,
`lesson.md`. BJJ pinned unchanged by the existing timetable/syllabus E2E.

### 5, 6, 7 — The judo, karate, taekwondo programmes (#1804, #1805, #1806)

One PR each: the seed file, its guard test, the seed CTA copy
(`academy.syllabus.seed.cta.<discipline>` — "Start from the Shotokan karate
programme"). **Content review by the owner is the merge gate**, not CI.

### 8 — Age divisions per discipline (#1807)

`ageDivisions()` replaces the constant; codes and labels per discipline; the
stats page title stops saying IBJJF except for BJJ.

### 9 — Copy (#1808)

`index.html` meta, the FAQ answers that name IBJJF and gi, the store listing,
`README.md`, `docs/README.md`, the academy description placeholder ("bring your
gi"), the whats-new entry.

---

## Open items

1. **One discipline per academy** — confirm before slice 1's migration lands.
   It is the decision the escape hatch is written around.
2. **Stripes on coloured belts in karate and taekwondo** — 0 or 4? Ask the
   friend who teaches. It is one number per row in one file.
3. **Judo above 5th dan** — black with dan count, red-and-white, or both
   allowed (the draft)?
4. **Karate kata style for the seed** — Shotokan as drafted, or ship kihon and
   kumite only and leave kata empty for the school to fill?
5. **The word in the UI** — *Disciplina* is FIJLKAM's word and fits all four;
   *Arte marziale* is what the owner says. Recommend *Disciplina* / *Discipline*.
6. **Age divisions** — the three drafted tables are from general knowledge and
   club pages, not from the federations' current programmes. Verify each
   against the season's document before slice 8.
