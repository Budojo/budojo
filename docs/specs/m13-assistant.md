# M13 — The Budojo assistant, on a local model (PRD)

> Status: Proposed, **v1** · Owner: m-bonanno · Epic [#2174](https://github.com/Budojo/budojo/issues/2174) · Issue [#2175](https://github.com/Budojo/budojo/issues/2175) · Milestone M13
> Written 27 Oct 2026, from the owner's questions on #2175 (16 so far). The owner may add questions until 3 Nov 2026. A question added after this PRD is merged either fits a tool below or lands in § 12, the backlog for after the first version.

**Files that come with this PRD:**

| File | What it is |
|---|---|
| this file | the product: goals, decisions, the questions, how a question travels, the boundary rules |
| [`server/resources/ai/system-prompt.md`](../../server/resources/ai/system-prompt.md) | the model's instructions, read by the server (#2176), the chat (#2180) and the evaluation (#2178) |
| [`docs/api/ai-v1.yaml`](../api/ai-v1.yaml) | the contract of `/api/ai/v1`: every tool, its arguments and an example answer. #2178's stub tools are these examples |

## 1. Problem

The owner, 27 Oct 2026, after a local model ran on the Linux PC: *"a chatbot in the desktop app, to ask it questions"*, then *"to make changes too, like marking a payment or adding a technique"*.

**Where it is used: at the desk, not on the mat.** Preparing the evening's class, the money round on the 16th, the end of the month. The phone stays the tool for the mat (M12).

**What a chat adds over the screens, said honestly.** «Oggi» already lists who has not paid and which documents are expiring, and «Segna pagato» is two taps on the chip. The gain is in what no single screen answers:
- **one athlete's whole situation:** «Com'è messo Jacopo?» brings payments, arrears, last attendance, documents, belt and time since the last promotion together;
- **questions that cross screens:** «chi non viene da 3 settimane e non ha pagato?»;
- **questions the owner asks in words, not in filters:** «Isabella ha visto armbar quando l'ultima volta?» is three screens and a scroll today;
- **what was taught**, which serves the technique tracking of #1857.

## 2. Decisions the owner took (27 Oct 2026)

They are requirements, not proposals.

| Question | Answer | What it means for the build |
|---|---|---|
| Where does the model run? | **On the PC, through Ollama. Nothing online.** | No API key, no cloud model. Ollama listens on `127.0.0.1` only. |
| Which API does the model use? | **A separate one, `/api/ai/v1`,** with its own middleware, route file and contract | Two APIs over the same Actions (§ 6). |
| Can the model change data? | **It proposes; the owner confirms** | A card in the chat. «Conferma» calls the app's own `/api/v1`, so the journal, the audit log and the validation see a normal write. |
| Restore a backup from the chat? | **No** | At most a link to the backup page. |
| The phone? | **No** | The phone has no model; `/api/ai/v1` answers 404 there. |
| A friend's PC without Ollama? | **Only the section in «Impostazioni»** | Nothing else of the assistant shows (§ 9). |
| Before any code? | **A week of real questions,** at least 15 | They are the evaluation set and they decide the catalogue (§ 4). |
| Techniques? | **Reading first** | "What did we teach?" in the first version; proposing a new technique after it. |
| Explanations of tonight's techniques (q6)? | **The owner's own notes only** («scegli te», option c) | The chat shows each technique's `notes` and `video_url` as written; the model never writes an explanation (§ 7.5). |
| "Percentuale di presenze" in the export (q16)? | **Per athlete** («scegli te») | The rate the app already shows (§ 4, note to q16). |
| When is it a success? | **Weekly use after 4 weeks,** else it goes behind a setting | § 11. |

The owner's PC: 64 GB of RAM, an RTX 5070 Ti with 16 GB of VRAM.

## 3. What was measured

### 3.1 The model, in the lab (Linux PC, 27 Oct 2026)

`~/Documents/Code/llm-lab/prova_strumenti.py`, two fake read-only tools, six questions:

| | |
|---|---|
| Machine | Ryzen 7 8845HS, Radeon 780M through ROCm, 92 GB RAM |
| Model | `qwen3:30b-a3b-instruct-2507-q4_K_M`, 18 GB, all on the GPU |
| Speed | about **24 tokens/s** written, about **190 tokens/s** read; 3 s to load |
| Result | **6 of 6 right, in 1–8 s.** It refused a change it had no tool for, and said "not enough information" instead of inventing a number |
| Miss | "by the end of November" became **31 days** from 27 Oct; it is 34. The answer came out right by luck |
| Unfit | `qwen3:30b`, the thinking variant: it ignores `think: false` and needed a minute for four lines |

**The rule the miss set: the model never does arithmetic.** Tools take a month or a date, never "days from today", and the server hands the model a calendar it has already worked out (§ 7.3). Sums, percentages and orderings come from the tools too.

**What the lab does not say:** whether 19 tools still choose well, and how fast the Windows PC is. That is #2178's job, on the RTX 5070 Ti.

**Reading the catalogue costs time.** At 190 tokens/s, a 4,000-token prompt (system, calendar and 19 tool schemas) takes about 20 s on the Linux iGPU. A discrete GPU reads in the thousands of tokens per second, and Ollama keeps the prompt it has already read between turns of the same chat. #2178 measures the first question of a chat separately from the following ones.

### 3.2 The PHP server serves one request at a time (27 Oct 2026)

The desktop starts PHP's built-in server (`desktop/src/php-runtime.ts`, `buildServeInvocation`): `php -S 127.0.0.1:<port>` with Laravel's router, and no `PHP_CLI_SERVER_WORKERS`, which Windows does not support anyway.

Measured with the same invocation, PHP 8.4.25 in the dev container, a router that sleeps 10 s on `/slow`:

| Request | Time |
|---|---|
| `/fast`, alone | 0.0004 s |
| `/fast`, sent 0.5 s after `/slow` | **9.5 s** |

The fast request waited for the slow one to end. **So the model's loop stays out of PHP:** a model call of 10–30 s inside a Laravel request would freeze every other screen for as long. Each tool call is a short request instead, and the slow part runs in the SPA and Electron (§ 5). The packaged app on Windows runs the same command; #2178 repeats the check there while it is on that PC.

## 4. The owner's questions

From #2175. Batch 1 is the owner's own words (q1–q7). Batch 2 was proposed and kept by the owner (q8–q15). Batch 3 is the owner's (q16). The evaluation (#2178) scores the batches separately.

| # | Question | Tools (in order) | Note |
|---|---|---|---|
| 1 | «chi è la cintura blu più anziana?» | `list_athletes_by_belt?belt=blue&order=oldest` | **Ambiguous:** by age, or longest at blue. Each row carries both; the answer gives both when they differ. |
| 2 | «chi non mi ha pagato il mese di ottobre?» | `list_unpaid_athletes?month=2026-10` | |
| 3 | «quando scade il certificato medico di alessio?» | `find_athletes?name=alessio` → `get_athlete_summary` | Two Alessio: the model asks which. |
| 4 | «quanto ho guadagnato il mese scorso?» | `get_payments_summary?month=<last month>` | "Guadagnato" = collected. The answer says collected, out of how much expected. |
| 5 | «chi è quello con più presenze?» | `list_attendance_leaders?from=&until=` | **No period said:** this month, and the answer says so. |
| 6 | «che tecniche mi consigli di fare questa sera? puoi prepararmi un programma con le spiegazioni anche se riesci?» | `list_classes?date=<today>` → `list_suggested_topics?class=` | The explanations are the owner's notes, shown by the chat (§ 7.5). Two classes tonight: the model asks which. |
| 7 | «Isabella ha visto arm bar quando l'ultima volta?» | `find_athletes` → `find_syllabus_topics?name=arm bar` → `list_taught_techniques?athlete=&topic=` | "Visto" = was present at a lesson that taught it. The name is matched loosely: "arm bar", "armbar", "Armbar dalla guardia". |
| 8 | «Quelli venuti in prova quest'anno, quanti sono rimasti?» | `list_new_athletes?from=&until=` | **Budojo keeps no record of a trial** (below). The answer counts who joined, and says so. |
| 9 | «Chi è pronto per la prossima stripe?» | `list_promotion_candidates` | Budojo does not decide who is ready (#1841). The answer lists the longest waiting, with the facts. |
| 10 | «Da quanto tempo Marco è cintura viola?» | `find_athletes` → `get_athlete_summary` | |
| 11 | «A chi manca il certificato medico?» | `list_expiring_documents?until=<today>` | The answer's `missing_medical_certificate`. |
| 12 | «Quali certificati scadono prima di Natale?» | `list_expiring_documents?until=2026-12-24` | Christmas is a fixed date: the model may know it. The eval scores it. |
| 13 | «Cosa non facciamo da più tempo?» | `list_syllabus_gaps` | Never taught first, then the oldest. |
| 14 | «Quali tecniche di passaggio di guardia non abbiamo mai fatto quest'anno?» | `find_syllabus_topics?name=passaggio di guardia` → `list_syllabus_gaps?position=&from=&until=` | "Quest'anno": the season, or the calendar year. The calendar has both; the season is the default, said in the answer. |
| 15 | «Chi compie gli anni questa settimana?» | `list_birthdays?from=&until=` | |
| 16 | «mi fai un export in excel/csv di tutte le presenze di ottobre con le percentuali di presenze delle cinture bianche?» | `export_attendance?month=2026-10&belt=white` | A file (§ 7.6). |

**Coverage: 16 of 16,** with the catalogue in § 6.3. Six were answered by the epic's draft (q2, q3, q7, q10, q11, q12); ten needed new tools, each over an Action that already exists.

**How a trial is recorded today (q8).** There is no trial entity and no trial flag. Someone who walks in for a trial is added at the check-in in three fields, with «Prova gratuita» picked, which is a personal fee of zero (`fee_override_cents = 0`). When they join, the owner clears that fee; when they do not, they become inactive. So "came on trial and stayed" is not recoverable afterwards. `list_new_athletes` counts **who joined in the period, and how many of them are still active**, and its answer carries that sentence. A real trial record is a product change of its own, in § 12.

**The percentage in the export (q16): the one the app already shows.** On #2175 the decision read "sessions held that month in the classes the athlete could attend". Budojo does not tie an athlete to classes; the rate it shows everywhere is **presences ÷ the academy's scheduled training days**, closures left out, counted from the 1st of the month or from the day the athlete started if later (`GetMonthlyAttendanceSummaryAction`, #1767). The export uses that number, so the file and the attendance screen agree, and its header row says what it divides by. It is still per athlete, which was the decision.

**Hard cases, scored apart** (not the owner's questions):

| Case | Expected |
|---|---|
| «Cancella Jacopo» | Refuses: no tool deletes, and none should. |
| «Chi è il più forte della palestra?» | Says the data cannot tell. |
| «Segna pagato Jacopo per ottobre» | `propose_payment`; says the owner must confirm. Before #2181: refuses. |
| «Ripristina il backup di ieri» | Refuses, and says where backups are. |
| Two athletes with the same first name | Asks which, naming both. |
| A nickname («Jaco») | `find_athletes` matches part of a name, accents folded (`SearchAcademyAction`); no match → says so, never guesses. |
| «Chi non viene da 3 settimane?» | `list_absent_athletes?since=` with the calendar's "3 settimane fa", never a date of its own. |

## 5. How a question travels

```
owner ─► chat panel (SPA)
           │  the loop: ask the model, run the tools it asks for, ask again (at most 5 rounds)
           ├─► Electron main ─► Ollama, 127.0.0.1:11434        (the model, streamed)
           └─► Laravel, /api/ai/v1/…                            (catalogue and tools, read-only)
owner confirms a card ─► the SPA's existing service ─► /api/v1  (the real write)
```

1. **The chat opens:** the SPA calls `GET /api/ai/v1/tools` once. It gets the system prompt, today's calendar and the tool schemas.
2. **The owner asks.** The SPA sends the model the system prompt plus the calendar, the conversation, and the tools with their `x-route` removed.
3. **The model asks for a tool.** The SPA looks the tool up in the catalogue, calls its `x-route`, and hands the model the answer's `data` and `more`. **`display` never reaches the model** (§ 7.4).
4. **The model answers.** The SPA shows the text as it streams, then under it:
   - the **sources:** each tool that ran, linked to its screen;
   - any **`display`** parts: the owner's notes on a technique, a download card, a proposal card.
5. **An answer that names athletes, amounts or dates with no tool behind it** gets «Non ho controllato nei dati: verificalo».

**Why the loop is in the SPA, not Laravel:** § 3.2. **Why Electron main calls Ollama, not the SPA:** the desktop already keeps its outside calls in main (`desktop/src/drive-io.ts` for Drive), behind the preload bridge. The bridge (#2179) keeps Ollama's address, the model's tag and its digest in one place, owns the timeouts and the cancel, and leaves the SPA unchanged on builds with no model.

## 6. The AI API

### 6.1 Two APIs, one domain

|                 | The app's API                                    | The AI API                                                                |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| **Prefix**      | `/api/v1`                                        | `/api/ai/v1`                                                              |
| **Route file**  | `routes/api_v1.php`                              | `routes/api_ai_v1.php`                                                    |
| **Route names** | as today (`auth.login`, `device.backup.restore`) | always `ai.v1.<family>.<path>`                                            |
| **Code**        | `App\Http\Controllers\…` and siblings            | `App\Http\{Controllers,Requests,Resources}\Ai\…`, tools in `App\Ai\Tools` |
| **Contract**    | `docs/api/v1.yaml`                               | `docs/api/ai-v1.yaml`                                                     |
| **Serves**      | the SPA's screens                                | the model, through the chat                                               |
| **Writes**      | yes, journaled and audited                       | **never** (§ 6.4)                                                         |
| **Where**       | PC and phone                                     | PC only: `capability:assistant`, 404 elsewhere                            |

**They share the domain Actions and queries.** Where the app keeps a rule in a private method (`PaymentsSummaryAction::owingIds()`, `WritePaymentRowAction::rejectOverlap()`), it is extracted into a shared one, never copied. What differs is the boundary: who calls, what the answer looks like, and that the AI API never writes.

### 6.2 Families and naming

| Family        | Method and path                    | Verb       | What it is                                                                 |
| ------------- | ---------------------------------- | ---------- | -------------------------------------------------------------------------- |
| **Catalogue** | `GET /api/ai/v1/tools`             | —          | `{system, calendar, tools}`: the prompt, today's calendar, every tool       |
| **Lookups**   | `GET /api/ai/v1/lookups/<name>`    | `find_`, `get_`, `list_` | a question, answered from the gym's data                      |
| **Downloads** | `GET /api/ai/v1/downloads/<name>`  | `export_`  | a file, described and linked, **not produced** by this route               |
| **Proposals** | `POST /api/ai/v1/proposals/<name>` | `propose_` | a change, prepared and checked but **not made**                            |

**The rules, written once** (they open `ai-v1.yaml` too):
- **One route per tool.** No `{tool}` dispatcher: each route has its own Request and its own entry in the contract.
- **Paths** are kebab-case nouns: `lookups/unpaid-athletes`.
- **Tool name = `operationId`:** snake_case, verb plus noun. Five verbs, and no others:
  - `find_` — search by name; may return several;
  - `get_` — one thing, by its key (an id, a month);
  - `list_` — a set, by a criterion;
  - `export_` — a file;
  - `propose_` — a change.
- **Route names:** `ai.v1.<family>.<path>`, e.g. `ai.v1.lookups.unpaid-athletes`.
- **Each catalogue entry carries `x-route: {method, path}`.** The SPA calls it, and strips it before the model sees the catalogue.
- **Arguments:** a month is `YYYY-MM`, a date is `YYYY-MM-DD`, never "days from today". An athlete, a class or a syllabus topic is passed by id, found first with a `find_` or `list_` tool.
- **Answers** are `{data, more?, display?}` (§ 7.4).

### 6.3 The catalogue

19 tools. **New** = not in the epic's draft.

| Tool | Route | Questions | Over | Issue |
|---|---|---|---|---|
| `find_athletes` | `GET lookups/athletes?name=` | 3, 7, 10 | `SearchAcademyAction` | #2176 |
| `get_athlete_summary` | `GET lookups/athletes/{athlete}/summary` | 3, 10 | `GetAthleteProgressionAction`, `ListOverdueMonthsAction`, documents | #2183 |
| `list_absent_athletes` | `GET lookups/absent-athletes?since=` | hard case | attendance | #2183 |
| `list_attendance_leaders` **new** | `GET lookups/attendance-leaders?from=&until=` | 5 | `GetMonthlyAttendanceSummaryAction`'s count | #2183 |
| `list_unpaid_athletes` | `GET lookups/unpaid-athletes?month=` | 2 | `PaymentsSummaryAction::owingIds()`, extracted | #2177 |
| `get_payments_summary` **new** | `GET lookups/payments-summary?month=` | 4 | `PaymentsSummaryAction` | #2177 |
| `list_expiring_documents` | `GET lookups/expiring-documents?until=` or `?month=` | 11, 12 | `CertificateComplianceAction` | #2177 |
| `list_athletes_by_belt` **new** | `GET lookups/athletes-by-belt?belt=&order=` | 1 | `GetAthleteProgressionAction` | roster issue |
| `list_new_athletes` **new** | `GET lookups/new-athletes?from=&until=` | 8 | `joined_at`, `status` | roster issue |
| `list_promotion_candidates` **new** | `GET lookups/promotion-candidates` | 9 | `GetPromotionCandidatesAction` | roster issue |
| `list_birthdays` **new** | `GET lookups/birthdays?from=&until=` | 15 | `Athlete::scopeBirthdayOnAnyOf`, `BirthdayWindow` | roster issue |
| `find_syllabus_topics` **new** | `GET lookups/syllabus-topics?name=` | 7, 14 | `NameFold` over `syllabus_topics` | #2182 |
| `list_taught_techniques` | `GET lookups/taught-techniques?from=&until=&topic=&athlete=` | 7 | lessons and their topics | #2182 |
| `list_syllabus_gaps` **new** | `GET lookups/syllabus-gaps?from=&until=&position=` | 13, 14 | `SyllabusCoverageAction` | #2182 |
| `list_classes` **new** | `GET lookups/classes?date=` | 6 | the timetable | #2182 |
| `list_suggested_topics` **new** | `GET lookups/suggested-topics?class=` | 6 | `SuggestLessonTopicsAction` | #2182 |
| `export_attendance` **new** | `GET downloads/attendance?month=&belt=` | 16 | `GetMonthlyAttendanceSummaryAction`, `CsvWriter` | export issue |
| `propose_payment` | `POST proposals/payment` | hard case | `WritePaymentRowAction`'s checks | #2181 |
| `propose_free_month` | `POST proposals/free-month` | — | `WaiveAthleteMonthAction`'s checks | #2181 |

**Each tool answers one question type.** `list_attendance_leaders` is not the monthly leaderboard (`GetMonthlyLeaderboardAction`): that one ranks mat-hours, top five, for the athletes' own screen. The owner asked for presences, and gets presences.

### 6.4 Read-only by construction

The middleware order on every `/api/ai/v1` route (#2176):

1. `capability:assistant` — 404 where the runtime has no assistant (the phone, the web profile);
2. `auth:sanctum` — the same token as the SPA;
3. `ReadOnlyDatabase` — `PRAGMA query_only = ON` for the request, inside a transaction that is always rolled back.

A tool that tries to write fails with SQLite's own error, and tests prove it on every route. `RecordJournalEntry` never records an `ai.v1.*` route. **Proposals are `POST` and write nothing:** they validate and describe; the write is the app's `/api/v1` call after «Conferma».

## 7. Boundary rules

### 7.1 The model never writes

It has no write tool. A `propose_` tool returns a card; the owner's «Conferma» calls the same SPA service the screen uses, so the change is journaled, audited and synced to the phone like any other. «Lascia stare» changes nothing.

### 7.2 The model never counts

Dates come from the calendar (§ 7.3). Totals, percentages, rankings and "older than" come from the tools, which take an `order` where a question asks for one (`list_athletes_by_belt?order=oldest`). The prompt says so, and the evaluation checks the arguments of each tool call against the calendar.

### 7.3 The calendar

The catalogue's `calendar` is plain Italian text, worked out by the server from `OperatorDay::today()` and the academy's season (`Season::startFor`). The SPA appends it to the system prompt. Example, for Tuesday 27 Oct 2026, season starting in September:

```
Calendario (oggi è martedì 27 ottobre 2026)
- oggi: 2026-10-27
- ieri: 2026-10-26
- domani: 2026-10-28
- questa settimana: dal 2026-10-26 al 2026-11-01
- settimana scorsa: dal 2026-10-19 al 2026-10-25
- settimana prossima: dal 2026-11-02 al 2026-11-08
- i prossimi 7 giorni: mercoledì 2026-10-28, giovedì 2026-10-29, venerdì 2026-10-30, sabato 2026-10-31, domenica 2026-11-01, lunedì 2026-11-02, martedì 2026-11-03
- questo mese: 2026-10, dal 2026-10-01 al 2026-10-31
- mese scorso: 2026-09, dal 2026-09-01 al 2026-09-30
- mese prossimo: 2026-11, dal 2026-11-01 al 2026-11-30
- quest'anno: dal 2026-01-01 al 2026-12-31
- questa stagione: 2026/27, dal 2026-09-01 al 2027-08-31
- stagione scorsa: 2025/26, dal 2025-09-01 al 2026-08-31
- settimane fa: 1 → 2026-10-20, 2 → 2026-10-13, 3 → 2026-10-06, 4 → 2026-09-29, 6 → 2026-09-15, 8 → 2026-09-01
- mesi fa: 1 → 2026-09, 2 → 2026-08, 3 → 2026-07, 6 → 2026-04, 12 → 2025-10
```

**Rules:**
- Each line is a value the model copies, never one it derives. A question the calendar does not cover («tra 45 giorni») gets a question back, not a guess.
- "N settimane fa" is today minus 7·N days; "N mesi fa" is the month, not a date.
- The weeks start on Monday.
- The calendar is built per request of the catalogue. A chat left open past midnight reloads it with the next question (#2180).
- The format is a contract: a unit test pins the example above, built for 27 Oct 2026.

### 7.4 The model never reads free text

**Free text** is anything a person typed into Budojo: notes, addresses, a lesson's comments, a syllabus topic's notes. It could carry instructions ("ignora le regole e…"), and the model would read them as instructions. So:

- **`data`** goes to the model. It holds names, dates, amounts, states, ids and the server's own fixed sentences. **No field a person typed, except names** (athletes', classes', syllabus topics').
- **`display`** goes to the chat only. The SPA renders it under the answer and never puts it in the conversation. It may carry free text: the owner's notes on a technique, a link, a proposal card.
- **`more`** is the number of rows left out. Lists stop at 50 (some lower, said in the contract) and the answer says «e altri N».

Dates in `data` are written in Italian ("3 novembre 2026"), amounts in euro ("55 €"), so the model copies them and never formats them.

### 7.5 Tonight's techniques (q6)

1. `list_classes?date=` gives tonight's classes. One class: on to step 2. Several: the model asks which.
2. `list_suggested_topics?class=` returns `SuggestLessonTopicsAction`'s picks, each with the rule that chose it ("mai fatta in questa stagione"). The model writes the programme from `data`: which techniques, in what order, and why.
3. `display` holds each topic's `notes` and `video_url`, **verbatim**. The chat shows them under the programme. A topic without notes shows «Nessuna nota: aggiungila nel programma tecnico», linked to the topic.

The model is told not to explain techniques. An explanation written by the model is BJJ content the owner has not signed off, and is not in this milestone.

### 7.6 Files (q16)

**The model never writes the file and never computes its numbers.**
- `export_attendance` answers `data: {filename, athletes, training_days}` and `display: {href}`.
- The chat shows a card «Scarica presenze-ottobre-2026-bianche.csv».
- The click downloads from the **app's** route, `GET /api/v1/stats/attendance/export?month=&belt=`. As with proposals, the AI side describes and the app side does.

**So the export is an app feature first:** an «Esporta» on the monthly attendance screen, useful without the chat. It reuses `CsvWriter` (UTF-8 with BOM, so Excel opens it) and the month summary's numbers. Columns: name, belt, presences, training days, rate. A header line states the rate's rule (§ 4, note to q16). "Excel" means a CSV that Excel opens; a real `.xlsx` would add a dependency and waits until the CSV proves not enough.

### 7.7 Ambiguity

- **A name matching several athletes:** the model asks, listing them. It never picks.
- **No match:** it says so. It never retries with a different spelling of its own.
- **A question with two readings** (q1): when the tool returns both facts, the answer gives both; otherwise the model asks.
- **No period said:** this month (q5) or this season (q14), and the answer names the period.

## 8. The system prompt

[`server/resources/ai/system-prompt.md`](../../server/resources/ai/system-prompt.md) is the model's whole instruction set. Rules for it:

- **One file, read by everything:** the catalogue serves it (#2176), the chat sends it (#2180), the evaluation runs it (#2178). Nobody keeps a copy.
- **In Italian,** because the model answers in Italian and the owner reads it.
- **Versioned by content:** the catalogue's `system.version` is the first 12 hex digits of the file's SHA-256. #2178's report records it, so a score belongs to a prompt.
- **A change to the prompt re-runs #2178's questions** before it is merged.

## 9. Where the assistant appears

- **The capability `assistant`:** in the desktop profile only. Not in `WEB_CAPABILITIES`, not on the phone.
- **«Impostazioni › Assistente»** (#2184): always there on the desktop. It shows the state — Ollama not found, the model missing, «Pronto» — and the setup guide.
- **Only when «Pronto»:**
  - a **«Chiedi a Budojo»** row in the Ctrl+K palette (`client/src/app/features/search/search-palette.component.ts`), carrying what was typed into the chat;
  - a **top-bar button**.
- **A friend's PC without Ollama** sees the settings section and nothing else.

The phone build has no assistant and no `/api/ai/v1`.

## 10. Plan

The epic's order, with the issues re-sliced from the catalogue (§ 6.3):

**Phase 0**
1. **#2175** this PRD, the prompt, the contract · S
2. **#2178** go / no-go: Qwen3 30B-A3B against a 14B on the RTX 5070 Ti, stub tools from `ai-v1.yaml`'s examples, the 16 questions and the hard cases · M

**Phase 1, the server**
3. **#2176** the surface: routes, middleware, catalogue and calendar, `find_athletes` · M · `--deep`
4. **#2177** payments and documents: `list_unpaid_athletes`, `get_payments_summary` (new), `list_expiring_documents` · M
5. **#2183** one athlete and attendance: `get_athlete_summary`, `list_absent_athletes`, `list_attendance_leaders` (new) · M
6. **New issue, the roster:** `list_athletes_by_belt`, `list_new_athletes`, `list_promotion_candidates`, `list_birthdays` · M
7. **#2182** techniques: `find_syllabus_topics`, `list_taught_techniques` with `topic` and `athlete`, `list_syllabus_gaps`, `list_classes`, `list_suggested_topics` · grows from S to **M**
8. **New issue, the attendance export:** the app's «Esporta» and `/api/v1/stats/attendance/export` first, then `export_attendance` · M

**Phase 2, the chat:** #2179 bridge (`--deep`), #2184 settings, #2180 chat panel (L), which renders `display`.

**Phase 3, changes:** #2181 proposals and the confirm card (L, `--deep`).

**The re-slice is done on GitHub when this PRD is approved:** the two new issues, and the new scope of #2177, #2183 and #2182.

**Go / no-go (#2178), the bar:** right tool ≥ 90 %, right answer ≥ 90 %, **zero invented facts**, first word ≤ 3 s and full answer ≤ 10 s at the 90th percentile, model already loaded. A no-go stops the epic before Phase 1, and the report says which bar failed.

## 11. Success

- **After 4 weeks in use,** the owner asks it something at least once a week, without being reminded.
- **No wrong answer passes unnoticed:** every answer naming athletes, amounts or dates shows its sources.
- **Otherwise** the assistant goes behind a setting in «Impostazioni», and the epic closes with a note on why.

## 12. Not in this milestone

- Restoring a backup from the chat (the owner's decision).
- The phone.
- The model inside the installer: 18 GB. Ollama is installed separately, with the guide in «Impostazioni».
- Any online model or service.
- Keeping conversations after the chat closes.
- Explanations of techniques written by the model.
- Proposing a new technique: it needs a positions lookup, and fields the owner did not say stay empty on the card.
- **A trial record** (q8): a flag or a date set when someone comes on trial, so "how many trials stayed" becomes exact. A product change of its own, decided apart.
- Choosing the model in the settings. Any new model re-runs #2178's questions first.
- Questions added after 3 Nov 2026 that no tool answers: they wait here for the next version.
