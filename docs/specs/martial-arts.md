# PRD — Multiple martial arts (#1799)

**Status**: kick-off. Nothing here has shipped. Every table marked **⚠️ draft** is
domain content and ships only after the owner has signed it off — ideally
against someone who teaches the martial art.

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

**The martial art is a property of the academy**, chosen once at setup. Every
place that today encodes BJJ reads the academy's martial art instead, and does
so from **one registry per martial art** — order of belts, stripe caps, training
modes, age divisions, the seed programme. Four martial arts at kick-off:

| Martial art | Value | Status |
|---|---|---|
| Brazilian jiu-jitsu | `bjj` | Today's behaviour, byte for byte. The default for every existing install. |
| Judo | `judo` | New |
| Karate | `karate` | New |
| Taekwondo | `taekwondo` | New — WT / Kukkiwon lineage, which is what FITA affiliates practise |

An existing install must not notice: no stored belt value changes, no label
moves, the BJJ sort order is the same twelve integers it is today.

## Non-goals

- **Per-athlete martial arts.** An athlete has one belt, in the academy's
  martial art. A dojo that teaches judo *and* karate, with an athlete holding a
  grade in each, is real and out of scope — see the first trade-off.
- **Custom ladders per academy.** Belts are a federation's rule; the programme
  is the academy's. See the third trade-off for the escape hatch.
- **Changing martial art on a populated academy.** Settable while the academy is
  empty, locked after. Every stored belt is a claim in the old ladder and there
  is no honest mapping from purple to anything in judo.
- **Karate style as a setting.** A style is not a property of the academy; it
  is a choice of **starter programme** at seed time. Karate ships more than one
  (§ The programmes), the owner picks one on the empty programme page, and from
  then on the programme is theirs to edit like any other. Nothing downstream
  reads the style, so nothing needs to store it.
- **ITF taekwondo.** Different patterns, different belt tips. WT only.
- **Wrestling, MMA, kickboxing, muay thai.** No belt ladder at all, or a
  federation-specific one nobody agrees on. That is a *nullable belt*, a
  different question from a fifth row in the table above, and it is not asked
  here.
- **Translating technique names.** The BJJ programme ships in English with the
  Portuguese and Japanese terms the sport uses; the others ship with the
  Japanese and Korean terms theirs use. The owner renames what they like.

---

## Trade-off: martial art on the academy vs grades per athlete

The general model is an `athlete_grades` table — `(athlete_id, martial_art,
belt, stripes)` — with the academy declaring which martial arts it teaches. It
is the only model that represents a two-art dojo honestly.

**Rejected for this epic**, for weight of change rather than principle:

1. `athletes.belt` is read in about fifty files. Every roster row, sort, filter,
   badge, spine, promotion row, feed post, share card, public profile and CSV
   column would change *shape* (one belt → a list of belts), not just source.
2. Every existing academy is single-art, and so are the three the owner wants
   to sell to. The multi-art dojo is a real customer we do not have.
3. `AthletePromotion`, `belt_promotion` posts and achievements would all need a
   martial art dimension too, or a promotion in judo would celebrate as a belt
   promotion of the athlete's *karate* rank.

**Chosen:** `academies.martial_art`, one value, and `athletes.belt` stays a
single column validated against that martial art's ladder.

**Escape hatch, written down so it is not re-derived:** the day a two-art dojo
is a real customer, add `athlete_grades`, backfill one row per athlete from
`(academy.martial_art, athlete.belt, athlete.stripes)`, and make `athletes.belt`
a denormalised copy of the row in the academy's *primary* martial art — the way
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
  move them into a per-martial-art `RankLadder`.

**Chosen: (b).** Type safety in fifty files survives; the model cast survives;
`AthletePromotion`, community payloads and the public profile keep working
unchanged; the client's literal union widens and stays a union. The DB values
already stored are all still cases. What (b) costs is a colour vocabulary that
contains belts no single martial art uses all of — which is what a vocabulary is.

**Two-tone belts** reuse the naming the coral belts introduced: `red-and-black`
and `red-and-white` exist today (#229), so the kids' half-belts are
`white-and-yellow`, `yellow-and-orange`, and so on. The first colour is the
upper half. They render through the `-a` / `-b` halves the spine already
composes (#1429) — the palette gains no new colour, only new pairs.

Taekwondo's 1st kup is red with black and is the same colour value as BJJ's 7th
degree: `red-and-black`. Same vocabulary entry, rank 10 of 12 in one ladder and
10 of 12 in the other by coincidence — and *label* "Red & black (7°)" in one and
"Red-black (1st kup)" in the other. That is exactly why labels are per
martial art (see FE behaviour) and ranks are per ladder.

## Trade-off: ladders per martial art vs per academy

The syllabus is seed-then-own — copied into rows the academy edits — because
every academy teaches its own programme. Should belts work the same way?

**No, not yet.** A belt order is a federation's rule; a karate school does not
decide that green comes before yellow. What *does* vary between schools is how
many kyu sit between the colours, whether the kids' half-belts are used, and
whether coloured belts carry *tacche* — and all three are answered without a
per-academy ladder: Budojo stores the belt, not the kyu number (§ The ladders);
the ladder **includes** the half-belts (a school that does not use them never
picks them); and the cap is **per grade**, generous only where the practice
varies (a karate school that never awards a *tacca* leaves the picker at 0).

**Escape hatch:** `academy_grades` — the ladder copied into rows on setup, same
pattern, same `409 when not empty` seed. Designed so `RankLadder::for(Academy)`
can read a table instead of a file without a caller noticing. Not built.

## Trade-off: generalise the gi / no-gi axis vs hide it

`ClassKind` and `TopicKind` exist because "a coverage chart that mixes heel
hooks and lapel guards says a number that is quietly wrong" (#1562). The cheap
option is to hide the picker for non-BJJ martial arts and store `both`.

**Rejected.** Every one of the three new martial arts has the *same* structural
split, and it is the first thing their instructors would look for on a coverage
chart:

| Martial art | Mode A | Mode B | The line it draws |
|---|---|---|---|
| BJJ | `gi` | `nogi` | lapel guards vs heel hooks |
| Judo | `tachi-waza` | `ne-waza` | standing (nage-waza) vs ground (katame-waza) |
| Karate | `kata` | `kumite` | forms vs sparring — kihon is `both` |
| Taekwondo | `poomsae` | `kyorugi` | forms vs sparring |

**Chosen:** the axis becomes the martial art's **training modes**. `both` and
`other` keep their meaning. A karate instructor who opens the check-in and is
offered "Gi" has already stopped listening; this is the difference between a
port and a product.

---

## Data model

### `academies.martial_art`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `martial_art` | varchar(16) | not null, **default `bjj`** | `App\Enums\MartialArt`. The default is for the backfill of existing rows and a backup taken before the column existed — the migration runs at desktop boot, so an old `budojo.sqlite` gets the column filled. **`POST /api/v1/academy` requires it**; the default never answers a request. |

No index — one academy per install.

### `App\Enums\MartialArt`

`Bjj = 'bjj'`, `Judo = 'judo'`, `Karate = 'karate'`, `Taekwondo = 'taekwondo'`.
This one **is** a closed enum by nature: the set of martial arts Budojo ships a
ladder and a programme for is a product decision, and a value outside it has
no registry to read.

### The registry — `server/database/seed-data/martial-arts/<art>.json`

One file per `MartialArt` case, guarded by a test that every case has a file
and every file parses. Read through `App\Support\MartialArt\MartialArtProfile`:

```php
final class MartialArtProfile
{
    public static function for(MartialArt $art): self;   // cached per process

    public function ladder(): RankLadder;
    /** @return list<TrainingMode> */
    public function trainingModes(): array;
    /** @return list<array{code: string, category: 'kids'|'adults', min: int, max: int|null}> */
    public function ageDivisions(): array;
    /** @return list<string> starter-programme keys, in offer order; empty until one ships */
    public function programmes(): array;
    public function programmeFile(string $key): ?string;          // path under seed-data/syllabus/
}

final class RankLadder
{
    /** @return list<Belt> in rank order */
    public function belts(): array;
    public function has(Belt $belt): bool;
    public function rankOf(Belt $belt): int;                      // 1-based position
    public function maxStripes(Belt $belt): int;
    /** @return list<Grade> — belt, max_stripes, count, first, kids */
    public function grades(): array;
    public function startingBelt(): Belt;                         // the lowest non-kids grade
    /** @return list<string|null> — padded to MAX_GRADES for the literal sort SQL */
    public function sortBindings(): array;
}
```

`Support`, not `Actions`: dependency-free helpers shared by ≥ 2 actions is the
canon's own example (`server/CLAUDE.md` § escape hatches). No Eloquent, no HTTP.

File shape:

```json
{
  "martial_art": "karate",
  "grades": [
    { "belt": "white", "max_stripes": 3 },
    { "belt": "white-and-yellow", "max_stripes": 3, "kids": true },
    { "belt": "black", "max_stripes": 4, "count": "dan", "first": 1 },
    { "belt": "red-and-white", "max_stripes": 2, "count": "dan", "first": 6 }
  ],
  "training_modes": ["kata", "kumite"],
  "age_divisions": [
    { "code": "bambini_a", "category": "kids", "min": 3, "max": 5 }
  ],
  "programmes": [
    { "key": "karate-goju-ryu", "file": "karate-goju-ryu.json" }
  ]
}
```

`kids: true` is informational — the picker groups them under a divider, nothing
validates on it. A school that never awards half-belts ignores the group.

**What a stripe counts is per grade, not per martial art.** `count` is
`stripe` (the default — a tape or a *tacca* on the belt), `dan` or `poom`, and
`first` (default 0) is the number the first step displays as. The **stored
value is always 0…`max_stripes`**, so validation and the DB column stay what
they are; the client displays `first + value`. So a FIJLKAM black belt is
`max_stripes: 4, count: dan, first: 1` — stored 0…4, shown 1°…5° dan — and the
same karate ladder can carry kids' *tacche* on green and dan on black, which a
single per-art noun could not say. BJJ's black is `count: stripe, first: 0`,
exactly as today.

`programmes` is **empty until the martial art's first starter programme has
shipped** (slices 5–7 each add an entry). Empty means the seed endpoint answers
404 and `AcademyResource.syllabus_programmes` is `[]`, so the programme page
never shows the CTA. A judo academy created between slice 3 and slice 5 gets
"write your own" — not a server error from a file that does not exist. A martial
art with more than one entry — karate — offers the choice on the empty
programme page (§ FE behaviour). The registry guard asserts every listed file
exists and every key is unique across all four registries.

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

`rank()` and `maxStripes()` are **deleted** from the enum. `rank()` has no
runtime reader — `applyBeltSort()` hard-codes the integers, and only the sync
test this epic retires called it. `maxStripes()` had **two**:
`ValidatesStripesAgainstBelt` and `StoreAthletePromotionRequest::validateStripeCap()`
(the bespoke copy for `belt_at_event`). Both became one `ValidationRule`,
`StripesWithinGrade`, which also covers the CSV import that had no cap at all. The
first draft of this list named one of the two; grep `->maxStripes()` before the
delete, not after.

### Training modes

`ClassKind` and `TopicKind` become `App\Enums\TrainingMode` — one enum, the
union of every martial art's modes plus `both` and `other`, with the profile
saying which subset an academy may use (`other` is a class-only value, as
today). `academy_classes.kind`, `lessons.kind` and `syllabus_topics.kind` keep
their name — renaming buys nothing and touches three tables — and stored values
do not change.

*Built without widening them (#1803).* The columns are declared `varchar(8)`
and `tachi-waza` is ten characters, but SQLite does not enforce a declared
length, and SQLite is the only engine the app runs on since #1230. The widening
planned here would have been a table rebuild on every install at boot, which
drops `lessons` while its children point at it — the one migration shape that
can take rows with it. A PEST test stores `tachi-waza` on a class and on the
lesson it produces, and a harness on a copy of a real database did the same
through the running app (9/9).

**All of it lands in one slice (4), never partially.** Today
`Rule::enum(ClassKind::class)` admits every case globally, and
`SuggestLessonTopicsAction::techniquesInScope()` is an exhaustive `match` over
the four cases. Widening the enum in slice 1 without the profile-aware rule
would let a BJJ academy store `kata`, and the first suggestion request for a
class in a new mode would throw `UnhandledMatchError`. So **slice 1 does not
touch the kinds at all**; slice 4 swaps the enum, widens the columns, makes the
three requests (`ValidatesAcademyClass`, `ValidatesSyllabusTopic`,
`SyllabusCoverageRequest`) check the profile, and rewrites `techniquesInScope()`
as the general rule — a mode admits itself and `both`; `both` and `other`
admit everything.

---

## The ladders

Rank is the 1-based position. `max_stripes` is the cap for **that grade**; at
`0` the stripe picker and the tiles do not render. `count` and `first` say what
a stripe on that grade means and how it is displayed (§ Data model).

**Budojo stores the belt, not the kyu number** — and that is what makes one
ladder per martial art enough. Italian karate schools run 6, 8, 9, 10 or 12
kyu (all five were found on published *programma esami* pages), with the same
colour worn for two or three kyu. A 10-kyu school whose yellow covers 9th and
8th kyu records *yellow*, with *tacche* if it wants the step to show. The
colours and their order are the federation's; the count between them is the
dojo's, and it never had to be stored.

### `bjj` — unchanged

Exactly today's `Belt::rank()` and `Belt::maxStripes()`: grey, yellow, orange,
green *(kids)*, white, blue, purple, brown, black *(cap 6)*, red-and-black,
red-and-white, red — cap 4 everywhere except black, `count: stripe` throughout.
A regression test pins the generated ladder to these twelve integers so the
refactor cannot move them.

### `judo` and `karate` — the FIJLKAM ladder

**Source: FIJLKAM *Regolamento Organico Federale*, Titolo XII, Art. 92**
(deliberated 1 April 2025, amended through July 2026 without touching Title
XII). It applies to judo, karate, aikido and ju-jitsu alike: *6° kyu bianca,
5° gialla, 4° arancione, 3° verde, 2° blu, 1° marrone; 1°–5° dan nera; 6°–8° dan
bianco-rossa; 9°–10° dan rossa.* Kyu grades up to brown are awarded *"ad
esclusivo giudizio dell'Insegnante Tecnico Sociale"*, at most three a year
(Art. 93).

The regulation names **no intermediate belts**. The two-colour half-belts are
club practice — widespread for children in both arts, and acknowledged by two
Italian competition rulebooks (CSAIN, PGS) that fold them back to the lower
colour — so the ladder carries them, marked `kids`, for the schools that award
them.

| # | Belt | Kids | Cap judo | Cap karate | Count | Shown as |
|---|---|---|---|---|---|---|
| 1 | `white` | | 0 | 3 | stripe | 6th kyu |
| 2 | `white-and-yellow` | ✓ | 0 | 3 | stripe | |
| 3 | `yellow` | | 0 | 3 | stripe | 5th kyu |
| 4 | `yellow-and-orange` | ✓ | 0 | 3 | stripe | |
| 5 | `orange` | | 0 | 3 | stripe | 4th kyu |
| 6 | `orange-and-green` | ✓ | 0 | 3 | stripe | |
| 7 | `green` | | 0 | 3 | stripe | 3rd kyu |
| 8 | `green-and-blue` | ✓ | 0 | 3 | stripe | |
| 9 | `blue` | | 0 | 3 | stripe | 2nd kyu |
| 10 | `blue-and-brown` | ✓ | 0 | 3 | stripe | |
| 11 | `brown` | | 0 | 3 | stripe | 1st kyu |
| 12 | `black` | | 4 | 4 | dan, first 1 | 1st–5th dan |
| 13 | `red-and-white` | | 2 | 2 | dan, first 6 | 6th–8th dan |
| 14 | `red` | | 1 | 1 | dan, first 9 | 9th–10th dan |

**The one difference is the *tacche*.** No federation — FIJLKAM, FIKTA, FESIK,
WKF — prescribes stripes on a coloured karate belt; the choice is the dojo's,
and both systems are in use. Adults wear solid colours; for children the
dominant pattern is the half-belt, and a minority mark the steps with one to
three *tacche* instead (Kyudokan Padova until age 13; a FESIK Shotokan dojo on
the white belt). Three brown kyu are also commonly worn on one brown belt. A cap
of 3 on every coloured karate belt covers all of it: a school that never
awards a *tacca* leaves the picker at 0. Judo has no such practice in the
sources and keeps 0.

Dan are **not marked on the belt** by any of these federations; `count: dan`
is how the app *displays* the grade, not a claim about embroidery.

### `taekwondo` — WT / FITA, ten kup

Confirmed by the owner: WT marks the steps with half-belts, not stripes.

| # | Belt | Kids | Cap | Count | Grade |
|---|---|---|---|---|---|
| 1 | `white` | | 0 | | 10th kup |
| 2 | `white-and-yellow` | | 0 | | 9th kup |
| 3 | `yellow` | | 0 | | 8th kup |
| 4 | `yellow-and-green` | | 0 | | 7th kup |
| 5 | `green` | | 0 | | 6th kup |
| 6 | `green-and-blue` | | 0 | | 5th kup |
| 7 | `blue` | | 0 | | 4th kup |
| 8 | `blue-and-red` | | 0 | | 3rd kup |
| 9 | `red` | | 0 | | 2nd kup |
| 10 | `red-and-black` | | 0 | | 1st kup |
| 11 | `black-and-red` | ✓ | 3 | poom, first 1 | 1st–4th *poom*, under 15 |
| 12 | `black` | | 8 | dan, first 1 | 1st–9th dan |

The 9th kup is "bianca superiore" in some clubs and "bianco-gialla" in others;
both describe a white belt with yellow on it, and the value is
`white-and-yellow` either way. The poom sits below black in rank so a roster
sorted by belt puts a 15-year-old who just converted next to the adults, not
above them.

## ⚠️ Draft training modes — need sign-off

The table in the fourth trade-off. Default for a **new class**: `gi` in BJJ (as
today), `both` elsewhere — a judo or karate class is mixed unless the owner says
otherwise. Default for a **new topic**: its position's mode, as today.

The programme form's example of the split, one per art (drafted in #1803, BJJ
unchanged):

| Art | English | Italiano |
|---|---|---|
| BJJ | Heel hooks are no-gi, lapel guards are gi. | I heel hook sono no-gi, le guardie di bavero sono gi. |
| Judo | O-soto-gari is tachi-waza, kesa-gatame is ne-waza. | L'o-soto-gari è tachi-waza, il kesa-gatame è ne-waza. |
| Karate | Saifa is kata, sanbon kumite is kumite. | Saifa è kata, il sanbon kumite è kumite. |
| Taekwondo | Taegeuk il jang is poomsae, a sparring combination is kyorugi. | Il Taegeuk il jang è poomsae, una combinazione da combattimento è kyorugi. |

Each continues "Leave it on *both* when it makes sense either way", naming the
art's own middle.

## Age divisions

Replaces the IBJJF constant in `AthleteAgeBandsAction::BANDS` with
`MartialArtProfile::ageDivisions()`. BJJ keeps the IBJJF table verbatim.

**Karate — FIJLKAM, verified** against the *Programma Attività Agonistica
Federale* 2026, Art. 6.1. Classes go by **calendar year of birth** ("dal 3° al
5° anno" is the years the athlete turns 3 to 5), so the band reads the age the
athlete reaches this calendar year, not their age today.

| Code | Class | Age | Category |
|---|---|---|---|
| `bambini_a` | Bambini A | 3–5 | kids |
| `bambini_b` | Bambini B | 6–7 | kids |
| `fanciulli` | Fanciulli | 8–9 | kids |
| `ragazzi` | Ragazzi | 10–11 | kids |
| `esordienti` | Esordienti | 12–13 | adults |
| `cadetti` | Cadetti | 14–15 | adults |
| `juniores` | Juniores | 16–17 | adults |
| `u21` | U21 | 18–20 | adults |
| `seniores` | Seniores | 21–35 | adults |
| `master_a` … `master_e` | Master A–E | 36–43, 44–50, 51–58, 59–65, 66+ | adults |

Two deliberate departures, both because a chart needs disjoint bands:
officially *Seniores* is 18–35 and U21 overlaps it; here U21 takes 18–20.
`kids` / `adults` follows FIJLKAM's own split — *preagonisti* up to Ragazzi,
*agonisti* from Esordienti. The bands move between seasons (Bambini A was 4–5
in 2025, 3–5 in 2026): the file's comment says which season it was read from.

**⚠️ Judo — FIJLKAM, not yet verified** *(draft; check the judo Programma
Attività before slice 8)*: Bambini 5–7, Fanciulli 8–9, Ragazzi 10–11,
Esordienti A 12, Esordienti B 13–14, Cadetti 15–17, Juniores 18–20, Seniores
21–35, Master 36+. Not the karate table — the IJF cadet is older than the WKF
one.

**⚠️ Taekwondo — WT / FITA, not yet verified**: Kids 5–8, Children 9–11,
Cadetti 12–14, Juniores 15–17, Seniores 18–29, Master 30+.

Codes are lower-case ASCII (`esordienti_a`); labels are client i18n keys under
`stats.ageBands.<art>.<code>` through an explicit map, never a built
string.

## ⚠️ The programmes — need sign-off, one PR each

Same file shape as `bjj-syllabus.json`, moved to `seed-data/syllabus/<key>.json`
(the BJJ file moves too, as `bjj.json`; `SeedSyllabusAction::SEED_FILE` becomes
`MartialArtProfile::programmeFile()`). Same guard test per file. Positions are
**groups**, because "you have done nothing from ne-waza all year" is what an
instructor acts on. Sizes below are targets, not counts.

- **Judo (~14 groups, ~120 techniques)** — Kōdōkan Gokyō plus katame-waza: ukemi;
  kumi-kata and tai-sabaki; te-waza (15); koshi-waza (10); ashi-waza (21);
  ma-sutemi-waza (5); yoko-sutemi-waza (16, the forbidden ones included and
  marked); osaekomi-waza (10); shime-waza (12); kansetsu-waza (10); ne-waza
  transitions and turnovers; renraku and kaeshi-waza; randori and shiai
  preparation; Nage-no-kata and Katame-no-kata. Throws are `tachi-waza`,
  holds/chokes/locks are `ne-waza`, the rest `both`.

  *As built (#1804), against the IJF/Kodokan classification of 1 April 2017:*
  14 groups, 137 items. Te-waza is **16** — the draft missed obi-tori-gaeshi.
  Yoko-sutemi-waza gains uchi-makikomi and loses daki-age, which is not in the
  classification. All seven Kodokan kata are listed, not only the two the
  first dan grades ask for; the owner unticks. The seed button, its hint and
  its toast are per programme under `academy.syllabus.empty.starter.<key>`
  (`starterProgrammeKeys()`, with a generic `other` fallback).
- **Karate — more than one starter programme, one per style.** Kihon and kumite
  are broadly shared between styles; kata are not, and a karate school is known
  by its kata. So karate's `programmes` lists one entry per style and the empty
  programme page asks which to start from. The owner's order:
  1. **Goju-ryu** (`karate-goju-ryu`) — drafted below.
  2. **A second Okinawan style — to be named by the owner's karate friend.**
     The candidates and how to tell them apart by the first kata a school
     teaches: Pinan or Fukyugata → **Shorin-ryu** (the most practised Okinawan
     style in Italy after Goju: Kyudokan, with its world headquarters in
     Palermo; Shidokan in Turin; the Matsumura line in Lombardy and Tuscany);
     Gekisai → **Okinawan Goju-ryu** (IOGKF, Jundokan) as distinct from the
     Japanese Goju-Kai; Sanchin then Kanshiwa → **Uechi-ryu** (8 kata; Milan and
     Pesaro, Caserta). Each is a disjoint kata set, so each is its own file.
  3. **Shotokan** — later, by the owner's call. It is the most widespread style
     in Italy (the Shirai group was about half of the old FITAK when it left in
     1989), so it is the obvious third.
- **Goju-ryu (~12 groups, ~90 items)** — junbi undo and hojo undo (makiwara,
  chiishi, nigiri game, kongoken, ishi sashi, kote kitae); kihon — dachi, uke,
  tsuki and uchi, geri; kihon ido (unsoku, shiho ido, happo ido); **heishu
  kata** — Sanchin, Tensho; **fukyu kata** — Taikyoku jodan, chudan, gedan,
  kake-uke, mawashi-uke *(the Goju-Kai opening; an Okinawan-lineage school
  unticks the five)*, Gekisai dai ichi, Gekisai dai ni; **kaishu kata, kyu** —
  Saifa, Seiyunchin, Shisochin; **kaishu kata, dan** — Sanseru, Sepai,
  Kururunfa, Seisan, Suparinpei; bunkai and renzoku bunkai; kakie; yakusoku
  kumite (sandan gi, kihon ippon, jiyu ippon); iri kumi and jiyu kumite, plus
  WKF-style kumite for competing schools. Kata are `kata`; kakie and every
  kumite form are `kumite`; conditioning, kihon and bunkai `both`. The kaishu
  order is the Okinawan one (Seiyunchin → Shisochin → Sanseru), which is also
  the order of the FIJLKAM Goju dan programme — 1st dan Sanchin, Saifa,
  Seiyunchin; 2nd Tensho, Shisochin, Sanseiru; 3rd Sanchin, Tensho, Seipai,
  Kururunfa. Goju-Kai teaches Sanseiru before Shisochin; the owner reorders.

  *As built (#1805):* 15 groups, 62 items, spelled as the IOGKF spells them
  (Sanseru, Sepai — the FIJLKAM, Jundokan and Goju-Kai variants live in the
  entity doc, since JSON carries no comments). The fukyu kata are two groups,
  Taikyoku and Gekisai, so an Okinawan-lineage school unticks the five
  Taikyoku in one tap.
- **Taekwondo (~11 groups, ~70 techniques)** — seogi (6), hand techniques (6),
  makki (6), chagi (12); **poomsae**: Taegeuk 1–8 Jang and the yudanja set
  (Koryo, Keumgang, Taebaek, Pyongwon, Sipjin, Jitae, Cheonkwon, Hansu, Ilyeo),
  all `poomsae`; kyorugi footwork and attack/counter drills, all `kyorugi`;
  hosinsul; kyokpa; competition preparation (electronic scoring, rules).

  *As built (#1806):* 11 groups, 69 items. Technique names in the Kukkiwon
  textbook's romanisation (*makgi*, *eolgul*, *apgubi*, *dollyeo-chagi*,
  *palgup*, *ttwieo-chagi*) rather than the draft's older spellings; the
  discipline words stay World Taekwondo's (*poomsae*, *kyorugi*), matching
  the training modes. *Gyeokpa* for breaking, as the Kukkiwon writes it.

### Sources for the karate content

FIJLKAM *Regolamento Organico Federale* Title XII (Art. 92–96); FIJLKAM
*Programma Attività Agonistica Federale* 2026 (Art. 6.1, 12); FIJLKAM
programme for the 1st–3rd dan exams (CNIT, updated 31 July 2023); the IOGKF kyu
grading syllabus; IKGA Goju-Kai lecture points; the FESIK Shorin-ryu programme
(2016); the FIKTA kyu programme (March 2024); published exam programmes of
Italian Goju-ryu, Shotokan and Kyudokan dojos. Researched on 22–23 September
2026; no federation publishes membership by style, so "most widespread"
rests on structural evidence, not a census.

---

## Business rules

- **The martial art is required at creation** (`POST /api/v1/academy`), one of the
  four values, 422 otherwise. The setup form always sends it; a fixture that
  does not is a fixture that fails.
- **The martial art is locked once the academy is not empty.** `PATCH /api/v1/academy`
  accepts `martial_art` only while the academy has **no athletes, no classes, no
  lessons and no syllabus topics — soft-deleted rows included**; otherwise 422
  on the field. Athletes count even soft-deleted because their belt is still a
  claim. Classes count because their `kind` is a mode of the old martial art.
  **Lessons count because they outlive their class**: `lessons.academy_class_id`
  is null-on-delete and `lessons.kind` is a snapshot taken at creation, so a
  timetable taken down leaves a season of `gi` evenings standing. **Topics count
  even soft-deleted because `Lesson::topics()` reads them `withTrashed()`** — a
  topic removed from the programme still names itself on the lessons that
  taught it, so a tidied-away programme is not a gone one. The rule is *no
  history shaped by the martial art at all*, and those four tables are where such
  history lives; `Academy::hasMartialArtHistory()` (or a `Support` predicate)
  answers it in one place for the request and for `martial_art_locked`. The
  precedent is the syllabus seed's 409: *a programme is a claim about what the
  academy teaches, and so is a martial art.*
- **A class or topic kind is valid when the martial art's profile lists it**
  (plus `both`; plus `other` for classes). `Rule::enum(TrainingMode::class)`
  alone would admit `kata` in a BJJ academy. Lands in slice 4 with the enum
  itself — see § Training modes for why the two cannot be split.
- **A belt is valid for an athlete when the academy's ladder has it.**
  `AthleteFieldRules` becomes `AthleteFieldRules::for(Academy)`: `belt` is
  `Rule::enum(Belt::class)` **and** in `ladder->belts()`. The rule already has
  two callers (the form request and the CSV import), so a purple belt in a
  judo file is refused in the preview with the same reason the form would give.
- **Stripes are capped by the grade, in the ladder.** `StripesWithinGrade`
  reads `ladder->maxStripes($belt)` — on create, edit, import and backfill. The global ceiling on the request moves
  from `max:6` to `max:10` — the dan — and the DB column (unsigned tinyint)
  needs nothing.
- **The belt sort reads the ladder, not a hand-synced list.** `orderByRaw()`
  takes a `literal-string`, so the SQL cannot be generated from a ladder.
  Instead it is a literal `CASE belt WHEN ? THEN 1 … WHEN ? THEN 16 ELSE 99`,
  and the ladder is **bound** into it (`RankLadder::sortBindings()`, padded
  with nulls that never match). `MAX_GRADES = 16` bounds every ladder; `ELSE`
  is above every rank, so a value outside the ladder surfaces at the end.
  `BeltRankSqlSyncTest` — which existed only to keep a string literal in step
  with an enum — is **retired**; `BeltRankSqlShapeTest` pins the SQL's shape
  and the registry guard pins BJJ to the twelve ranks it had.
- **The owner who enrols themself gets the ladder's starting belt**
  (`EnrollSelfAsAthleteAction` → `RankLadder::startingBelt()`): the lowest
  grade that is **not** a kids' step. Not simply the first rung — BJJ's opens
  with the kids' grey. White in all four ladders today, as the ladder's answer
  rather than a constant.
- **The promotion backfill validates against the ladder too**
  (`StoreAthletePromotionRequest`: `from_belt`, `to_belt`, `belt_at_event`).
  Chain consistency (#1431) is untouched; it compares strings.
- **Every surface that shows a belt is in the belt's own academy**, so the
  viewer's ladder is the belt's ladder and no payload needs a `martial_art`.
  The feed, comments, reactions and the check-in list are academy-scoped, and
  the public profile — the one this PRD first thought an outsider could see —
  404s any viewer not in the profile's academy (`PublicProfileController`'s
  same-academy gate). **The gap is the athlete portal**: its routes never load
  the academy, so the client has no ladder there and reads as BJJ. Web-only
  and frozen, so it is #1813 rather than part of #1801.
- **The seed copies one of the academy's martial art's starter programmes.**
  `POST /academy/syllabus/seed` takes an optional `programme` key and reads
  `MartialArtProfile::for($academy->martial_art)->programmeFile($key)`. The key
  may be omitted when the art offers exactly one; it is **required** when it
  offers more (karate), and a key the art does not offer is a 422 on the field.
  When the art offers **none** yet, the endpoint answers **404** with a message,
  never a 500 from a missing file, and the resource's `syllabus_programmes` is
  `[]` so the client does not offer the button in the first place. The 409 rule
  is unchanged. The chosen key is **not stored** — the rows are the academy's
  from that moment.
- **Import synonyms resolve to the vocabulary, then the ladder validates.**
  `BeltText` gains the two-tone spellings (`bianco-gialla`, `bianco gialla`,
  `bianca/gialla`, `giallo-verde`, …). Resolution does not depend on the martial art —
  `blu` means `blue` everywhere — and the ladder check afterwards refuses what
  the academy does not award. The two steps stay two classes.

## API surface

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/v1/academy` | `martial_art` **required**, `MartialArt` enum |
| `PATCH` | `/api/v1/academy` | `martial_art` accepted while empty; 422 `martial_art` otherwise |
| `GET` | `/api/v1/academy` | `AcademyResource` gains `martial_art`, `grades: [{ belt, max_stripes, kids }]` in rank order, `martial_art_locked: bool` (so the form renders the locked state without a failed PATCH) and `syllabus_programmes: string[]` (starter-programme keys, empty until one ships); each grade also carries `count` (`stripe` \| `dan` \| `poom`) and `first`; `training_modes: [a, b]` arrives with slice 4 |
| `GET` | `/api/v1/athletes`, `/{id}` | unchanged shape; `belt` may now be any vocabulary value |
| `POST` | `/api/v1/academy/syllabus/seed` | optional `programme` key (required when the art offers more than one; 422 if not offered); **404** while none has shipped |
| `GET` | `/api/v1/public/…` (profile) | `martial_art` beside the belt — with #1801, where the profile renders it |

OpenAPI: `MartialArt` and `Grade` schemas; `Belt` enum extended and its
description rewritten — *a colour vocabulary; which colours an academy awards,
in what order and with what cap, is `Academy.grades`*; `TrainingMode` replaces
`ClassKind` / `TopicKind`; `Academy` properties; the 422 on `PATCH`.

Docs in the same PRs: `academy.md` (column, lock rule, the registry), `athlete.md`
(the enum table becomes a vocabulary table; validation is per ladder),
`athlete-promotion.md` (`belt_at_event` note), `academy-class.md` and
`syllabus-topic.md` (`TrainingMode`), `DESIGN_SYSTEM.md` (the belt palette, once).

## FE behaviour

### The ladder comes from the API; the labels do not

`AcademyService` exposes `martialArt()`, `grades()` and `trainingModes()` as
computed signals off the loaded academy. **Order and caps are read from
`grades`** — `MAX_STRIPES_PER_BELT` and `BELT_ORDER` are deleted, not widened,
because a second copy of the ladder on the client is a second answer.

**Labels stay on the client** (they are UI copy, like `BELT_KEYS` today), as
one explicit two-level map so the i18n parity check can see every key:

```ts
GRADE_KEYS.common['white']            // 'grades.white'  — "White" / "Bianca", every martial art
GRADE_KEYS.bjj['green']               // 'grades.bjj.green' — "Green (kids)" / "Verde (bambini)"
GRADE_KEYS.bjj['red-and-black']       // 'grades.bjj.redAndBlack' — "Red & black (7°)"
GRADE_KEYS.taekwondo['black-and-red'] // 'grades.taekwondo.blackAndRed' — "Poom"
```

A martial art override wins; `common` answers otherwise. The twelve BJJ strings
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

`/setup` asks for the martial art **first** — before the name — as four large
buttons in a 2×2 grid (Hick: four, not a dropdown; the choice frames every
field after it). Nothing is pre-selected: a default BJJ is the bug this work
exists to fix, and existing academies are BJJ by the migration, not by the
form. Text labels only: `pi pi-*` has no martial-arts glyph and the canon
forbids a second icon family. The setup E2E (`setup.cy.ts`) picks one; a second
case picks judo and asserts the athlete form then offers `white-and-yellow` and
not `purple`.

*Built as `MartialArtPicker`, not the `p-selectbutton` first planned:* a select
button is one joined row, and "Brazilian jiu-jitsu" beside three other labels
does not fit the 320 px setup card. The grid uses the pill language of the
training-days picker on the same screen, so the two read as one family.

### Academy page

The martial art shows as a read-only value while `martial_art_locked` is true,
with the reason written under it ("Fixed now: the academy already has athletes,
a timetable, lessons or a programme") — not a tooltip, which a phone cannot hover; as the
same picker while it is false. A locked form leaves `martial_art` off the
`PATCH`. No dialog: the lock is a fact about the data, not a warning to
dismiss. The detail page names the martial art in its own row.

### Everywhere a belt is picked or sorted

The athlete form, the roster filter, the check-in render order, the promotions
list, the stats doughnut — each iterates `grades()` instead of `BELT_ORDER`.
The stripe picker renders `0…max_stripes` for the selected grade and hides at 0.
The sort toggle's copy "black → white" becomes "highest → lowest": true in all
four ladders, and it was the ranks, not the colours, that the sort meant.

### What a stripe counts

The stripe control and the tiles read the grade's `count` and `first`, not a
per-art noun: `grades.count.stripe` ("stripes" / "gradi" in BJJ, "tacche" in
karate — the noun *is* per art for `stripe`, through the same two-level map as
the belt labels), `grades.count.dan` ("1° dan"…), `grades.count.poom`. The
displayed number is `first + value`. A karate roster can therefore show "green,
2 tacche" and "black, 3° dan" side by side, which a single noun per art could
not. Shown only where the grade's cap is above zero.

### The programme page before and after the programmes ship

`syllabus_programmes` empty → the empty state offers "write your own" and
nothing else; the seed CTA and its hint do not render. Lands with slice 3 — the
first slice that can create a non-BJJ academy — not with the programmes.

One programme → the single CTA it has today ("Start from the BJJ programme").
**More than one → one choice per programme**, named by style ("Start from
Goju-ryu", "Start from Shorin-ryu"), plus "write your own" — a `p-selectbutton`
or a short list, never a dropdown for two or three options (Hick). Labels
through `academy.syllabus.empty.starter.<key>`, an explicit map
(`starterProgrammeKeys()`, #1804).

### Check-in, timetable, programme, lesson sheet, coverage filter

The mode picker and the coverage toggle iterate `trainingModes()`; labels
through `academy.trainingMode.<mode>`, an explicit map over the `TrainingMode`
union, with `both` per art ("Gi and no-gi", "Kata and kumite"). BJJ keeps every
string it had.

*As built (#1803):* the timetable's and the programme's pickers are a 2×2 grid
of buttons (`ChoiceGrid`, the martial-art picker's layout, extracted) rather
than a `p-selectbutton` — "Tachi-waza and ne-waza" does not fit a segmented row,
which broke words at their hyphens and clipped "Other" on a phone. The topic
picker now lists the two modes first and the middle under them, the class
picker's order. The check-in and the lesson sheet never showed a mode, so they
had nothing to change.

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
  `martial_art = 'bjj'`. Every belt validates, every label is the same string
  under a renamed key, the sort produces the same order. The whats-new entry
  says so, because an owner reading "four martial arts" will look for what moved.
- **Restore from a backup taken before the column existed.** Same migration at
  boot, same default. Documented in `backup-restore.md` as "nothing to do".
- **A judo academy imports a CSV with `viola`.** The row is refused in the
  preview: *"viola is not a belt this academy awards"*, not a generic 422.
- **`PATCH martial_art` on an academy with one soft-deleted athlete.** 422. The
  form never shows the control in that state, so this is the API guarding
  against a client that skipped the check.
- **`PATCH martial_art` on an academy whose only class was deleted, with a
  season of lessons behind it.** 422 — the lessons kept the class's `kind`.
  Same for an academy whose programme was deleted topic by topic: the topics
  are soft-deleted and still linked to lessons. "Empty" means the four tables,
  trashed rows included.
- **A judo owner opens the programme page before the judo programme has
  shipped.** No seed button — `syllabus_programmes` is empty — and the empty
  state says to write their own. A client that calls the endpoint anyway gets
  404 with a message, not a 500.
- **A karate owner seeds without naming a style.** 422 on `programme`: karate
  offers more than one, and guessing would put a Goju-ryu school's name on a
  Shorin-ryu programme. The client never sends that request; the page asks.
  *As built (#1805):* true once the second style ships (#1810). Until then
  karate offers Goju-ryu alone, and a seed without a key copies it.
- **A karate school whose ladder has ten kyu.** Nothing to configure: yellow
  covering 9th and 8th kyu is recorded as yellow, with *tacche* if the school
  shows the step. The kyu number was never stored.
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

### 1 — BE: the martial art and its ladder (#1800)

`MartialArt` enum; `MartialArtProfile` + `RankLadder`; the four registry files
(BJJ verbatim from today's enum; judo and karate from the FIJLKAM regulation;
taekwondo as confirmed by the owner; `programmes` listing BJJ's only), with
`count` / `first` per grade; migration `academies.martial_art`;
`AcademyResource` — `martial_art`, `grades`, `martial_art_locked`,
`syllabus_programmes`; `POST` required / `PATCH` locked on the **four**
tables, trashed rows included; `AthleteFieldRules::for()`;
`StripesWithinGrade` (replacing the trait and the backfill's copy)
via ladder; `applyBeltSort()` bound to the ladder; `EnrollSelfAsAthleteAction` starting belt;
`StoreAthletePromotionRequest` ladder check on the three belt fields; `BeltText`
two-tone synonyms; `Belt` gains eight cases and loses two methods; factories
pick from the academy's ladder; `SeedSyllabusAction` reads the profile (BJJ
file moved to `syllabus/bjj.json`, content identical, guard test moved with it),
takes the optional `programme` key, and answers 404 when the art offers none. **Nothing about kinds** — `ClassKind`, `TopicKind` and the three
`kind` columns are untouched until slice 4, for the reason in § Training modes.
PEST: registry guard (every case has a file; parses; belts are cases; caps
sane; `first` only on `dan` / `poom` grades; every listed programme file exists
and keys are unique across registries; BJJ ladder equals the historical
ranks), `CASE` generation and `ELSE`, 422 outside the ladder on form + import +
promotion backfill, cap per grade on both stripe validators, lock rule for each
of the four tables plus a trashed athlete, a trashed topic and an orphaned
lesson, `POST` requires martial art, seed 404 for a martial art without a
programme. Docs + OpenAPI in this PR.

### 2 — FE: belts drawn from the ladder (#1801)

`AcademyService` signals; `Belt` union widened; `MAX_STRIPES_PER_BELT` /
`BELT_ORDER` deleted; `GRADE_KEYS` two-level map + i18n keys (both locales, BJJ
strings unchanged); one belt palette in `budojo-theme.scss`, badge + spine
composing halves, doughnut and share card reading it; every picker/filter/sort
iterating `grades()`; stripe noun; `text-contrast.spec.ts` for the new pairs.
Visual verification: roster, form, check-in, promotions, stats, share card — for
all four ladders, light and dark, mobile and desktop.

### 3 — FE: choose the martial art at setup; see it on the academy page (#1802)

The picker on `/setup`, the locked/unlocked control on the academy page,
`martial_art_locked` consumed, i18n `martialArts.<value>`, the programme page's
empty state read from `syllabus_programmes`, `setup.cy.ts` + `academy.cy.ts`
cases.

### 4 — Training modes (#1803)

**Server and client in one PR** — § Training modes says why the two halves
cannot be split. Server: `TrainingMode` replaces `ClassKind` / `TopicKind`
(wire values unchanged); the three `kind` columns stay `varchar(8)`, which
SQLite does not enforce (§ Training modes); `ValidatesAcademyClass`, `ValidatesSyllabusTopic` and
`SyllabusCoverageRequest` check `MartialArtProfile::trainingModes()`;
`techniquesInScope()` becomes the general rule; `SyllabusCoverageAction`
confirmed literal-free; `AcademyResource.training_modes`. PEST: 422 for a mode
outside the martial art on all three requests; the suggestion for a `kata`
class admits `kata` + `both` and throws for no mode; BJJ pinned by the
existing timetable, syllabus and suggestion tests. Client: `TrainingMode`; the
mode picker on timetable, programme, lesson sheet; the coverage toggle; the
check-in class pick; `academy.trainingMode.*` keys; `academy-class.md`,
`syllabus-topic.md`, `lesson.md`. BJJ pinned unchanged by the existing
timetable/syllabus E2E.

### 5, 6, 7 — The judo, karate, taekwondo programmes (#1804; karate #1805, #1810, #1811; #1806)

One PR per programme file: the seed file; **its entry in the martial art's
`programmes`** — the line that turns the CTA on and the 404 off; its guard
test; the CTA, hint and toast (`academy.syllabus.empty.starter.<key>` —
"Start from Goju-ryu"). Karate is **two PRs at kick-off** — Goju-ryu now, the second style
once the owner's friend has named it — and Shotokan later is a third. The
choice on the programme page ships with the **second** karate programme; until
then karate offers one and shows one CTA like any other art. **Content review by
the owner is the merge gate**, not CI.

### 8 — Age divisions per martial art (#1807)

`ageDivisions()` replaces the constant; codes and labels per martial art; the
stats page title stops saying IBJJF except for BJJ. Karate's table is verified
(FIJLKAM 2026); judo's and taekwondo's are verified before this slice merges.
FIJLKAM counts by **year of birth**, which may not be how the action computes
age today — check, and pin it with a test on 31 December and 1 January.

### 9 — Copy (#1808)

`index.html` meta, the FAQ answers that name IBJJF and gi, the store listing,
`README.md`, `docs/README.md`, the academy description placeholder ("bring your
gi"), the whats-new entry.

---

## Decisions taken, and what is still open

Taken by the owner on 22–23 September 2026:

1. **One martial art per academy.** "A dojo is one head — one master, one
   association president." The escape hatch stays written down, not built.
2. **Taekwondo marks steps with half-belts, not stripes** (WT). Karate was
   researched: both half-belts and *tacche* are in use and no federation
   decides, so the ladder supports both (§ The ladders).
3. **Judo and karate above 5th dan** — settled by the FIJLKAM regulation:
   black to 5th, red-and-white 6th–8th, red 9th–10th.
4. **Karate styles: Goju-ryu and an Okinawan style first, Shotokan later.**
   The Okinawan style is still to be named — the owner is asking a friend who
   teaches; § The programmes says how to tell the candidates apart.
5. **The word is *arte marziale* / *martial art*** — in the UI and in the code.
   Never *disciplina*.

Still open:

- **The second karate style** (item 4). Blocks only its own programme PR, #1810.
- **Judo and taekwondo age tables** — verify against the current federation
  documents before slice 8. Karate's is verified.
- **The judo and taekwondo programmes** — drafted, not yet reviewed.
