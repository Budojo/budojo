# PRD — Entry carnets (#1364)

**Status**: shipped in v2.47.0. **Amended by #1380** — see the box below before
trusting the consumption model described here.

> ### Amendment: the consumption model changed (#1380)
>
> This PRD describes consumption as **event-driven**: an entry is charged when a
> presence is marked, and sessions predating the sale are never revisited. That
> shipped, and it was wrong for the first real carnet an owner sold — dated
> 4 September, it ignored the session recorded on the 2nd.
>
> A carnet now carries a **`valid_from`** date, editable after the sale and
> allowed to precede it, and what it pays for is a **function of its window**
> rather than of when someone clicked. `carnet_entries` became a projection
> rebuilt from the facts by `ReconcileCarnetEntriesAction`.
>
> What survived unchanged: monthly-first, the balance stopping at zero, FIFO by
> earliest expiry, and attendance never being blocked. What changed besides the
> model: the expiry now hangs off `valid_from` rather than the sale, paying a
> month afterwards *releases* the entries it had taken (this PRD's "Edge cases"
> section says the opposite), and a carnet can be **deleted**, which the
> Non-goals below rule out.
>
> `docs/entities/carnet.md` and `carnet-entry.md` describe the current model.

## Why

Today the academy has exactly one way to charge an athlete: the fixed monthly fee (`academies.monthly_fee_cents`), recorded one row per `(athlete, year, month)` in `athlete_payments`. That model assumes an athlete trains on a recurring basis and pays for calendar time.

It doesn't fit the occasional athlete — someone who shows up six or seven times across a year. Charging them a monthly fee for the months they touch is either unfair to them or lossy for the academy, and today the owner works around it off-book (cash, a note in a paper register, a mental tally).

**Entry carnets** are the missing option: a pre-paid pack of N entries (default 10 for €70) valid 12 months from purchase, consumed one entry per training day attended.

## Goal

The owner can sell a carnet to an athlete, and from then on the athlete's residual balance and expiry are **derived from facts already in the system** — never a hand-maintained counter. Attendance keeps working exactly as it does today; carnet consumption rides along as a side-effect of marking presence, and correcting a presence correctly refunds the entry.

## Non-goals

- **Gating attendance on payment.** Marking presence is never blocked, refused, or warned-on for lack of coverage. `attendance_records` and payments are decoupled today and stay decoupled — the carnet ledger observes attendance, it does not authorise it. (See § "Uncovered attendance" for what this means in practice.)
- **Turnstile / badge / access-control hardware.** The domain concept in Budojo is "the instructor marks who was present" (or the athlete self-marks from the portal), not a gate that opens. Nothing in this PRD implies a check-in device.
- **Partial or fractional consumption** — half-sessions, two-entries-for-a-seminar, per-discipline pricing. One attended day = one entry, always.
- **Refunds, transfers, or cancellation of a purchased carnet.** A sold carnet is a fact. Correcting a mis-sale is a follow-up ticket, not PR 1.
- **Unifying the monthly fee and the carnet behind a common `subscriptions` abstraction.** See the trade-off below.

---

## Trade-off: one polymorphic `subscriptions` table vs. two independent entities

The tempting move is a single `subscriptions` table with a `type` discriminator (monthly | carnet) plus nullable type-specific columns, so "what is this athlete paying with?" is one query.

**Rejected.** Reasons, in order of weight:

1. **There is no `subscriptions` table to extend.** `athlete_payments` is not a subscription — it has no state, no lifecycle, no active/expired transition. It is a fact-of-payment ledger: a row means "this month was paid", its absence means "it wasn't", and un-marking a month hard-deletes the row. Introducing a polymorphic subscription entity means first *inventing* subscription semantics for the monthly fee that it has never had, then migrating a year of production rows into them.
2. **The two things are shaped differently.** The monthly fee is keyed on calendar time `(year, month)` and is never consumed — it either covers a month or it doesn't. A carnet is keyed on a validity window and *is* consumed, one unit at a time, by an event elsewhere in the system. They share the word "payment" and almost nothing else. Forcing them into one table produces a row where half the columns are always null.
3. **CLAUDE.md § DRY** — "accidental duplication is not shared knowledge — don't prematurely extract a second-occurrence match if the two sites will evolve independently." Two payment mechanisms is exactly a second occurrence, and they will evolve independently.

**Chosen:** `athlete_payments` is untouched. Carnets get their own two tables. If a third payment mechanism ever appears, *that* is the moment to reconsider an abstraction — with three real examples instead of two guesses.

## Trade-off: counter column vs. entry ledger

A `carnets.remaining_entries` integer that decrements on use is the obvious model and the wrong one: it is a derived value stored as a fact, so every path that fails to update it (a bug, a rolled-back transaction, a soft-deleted attendance, a manual DB fix) silently corrupts the balance with no way to detect the drift.

**Chosen:** an append-only `carnet_entries` ledger, one row per consumed entry, each pointing at the `attendance_record` that consumed it. Balance is always `carnets.total_entries - count(carnet_entries)`. It cannot drift, because there is nothing to keep in sync — and "which sessions did I use my carnet on?" becomes a join instead of a feature request.

Cost: a `COUNT` per carnet on read. At the scale of a single academy on local SQLite this is not a consideration.

## Trade-off: pessimistic locking for concurrent consumption

The stock answer to "decrement a balance safely" is `lockForUpdate()` inside a transaction. **Not applicable here**, for two independent reasons:

1. **Budojo ships as a local-first single-tenant desktop app** (M11): one Electron shell, one supervised PHP process, one SQLite file per academy. There is no concurrent-terminal check-in scenario to protect against. SQLite serialises writers at the file level regardless.
2. **The structural guarantee is better than the lock anyway.** A `UNIQUE` index on `carnet_entries.attendance_record_id` makes "one attendance consumes at most one entry, ever" a property of the schema. A duplicate consumption attempt fails on the constraint instead of racing for a lock — the same shape as the `UNIQUE(athlete_id, year, month)` index that makes `RecordAthletePaymentAction`'s `createOrFirst()` safe today.

Over-drawing a carnet (an 11th entry on a 10-entry pack) is a *balance* question, not a concurrency one, and is checked in the action before insert. Worst case under a hypothetical race is one entry over — recoverable, and impossible in the single-process runtime we actually ship.

---

## Data model

### Academy configuration

Two nullable columns on `academies`, mirroring the `monthly_fee_cents` precedent exactly:

| Column | Type | Notes |
|---|---|---|
| `carnet_price_cents` | unsigned int, nullable | Price of one carnet in cents (€70 = `7000`). `null` ≡ "carnets not offered by this academy". |
| `carnet_entries` | unsigned tinyint, nullable | Entries per carnet (default offering: `10`). `null` ≡ not configured. |

Both settable via the existing `PATCH /api/v1/academy`. Selling a carnet while either is `null` returns `422` with the offending field as the error key — same contract as recording a payment with no `monthly_fee_cents`.

### `carnets` — one purchased pack

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `code` | char(4), not null, **UNIQUE** | Human-facing handle for the carnet — see § Carnet code below. Generated server-side, never accepted from the client. |
| `athlete_id` | bigint fk → `athletes.id`, cascade delete, indexed | Tenant scoping rides the athlete, as everywhere else. |
| `total_entries` | unsigned tinyint, not null | **Snapshot** of `academies.carnet_entries` at purchase. |
| `price_cents` | unsigned int, not null | **Snapshot** of `academies.carnet_price_cents` at purchase. Raising the price later never rewrites sold carnets. |
| `purchased_at` | date, not null | Business date of the sale. Back-dateable by the owner (unlike `athlete_payments.paid_at`, which is wall-clock only) — the paper register being transcribed is the whole point. |
| `expires_at` | date, not null | `purchased_at + 12 months`, computed once at insert and **stored**. Storing it (rather than deriving on read) keeps "which carnets are valid on date D" a plain indexed `WHERE`, and means a future change to the validity period doesn't retroactively expire carnets already sold. |
| `created_at`, `updated_at` | timestamps | |

Indexes: `INDEX(athlete_id, expires_at)` — the "active carnets for this athlete on this date" lookup, which is every read path.

No soft-deletes: a sold carnet is a fact, and there is no un-sell flow in scope.

### `carnet_entries` — the consumption ledger

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `carnet_id` | bigint fk → `carnets.id`, cascade delete, indexed | |
| `attendance_record_id` | bigint fk → `attendance_records.id`, cascade delete, **UNIQUE** | The presence that consumed this entry. Unique ⇒ one attendance can never consume two entries. |
| `used_on` | date, not null | Denormalised copy of `attendance_records.attended_on`. Lets the ledger be read (and a balance-on-date computed) without joining attendance. |
| `created_at`, `updated_at` | timestamps | |

**Balance** for a carnet: `total_entries - carnet_entries()->count()`.
**Active on date D**: `purchased_at <= D <= expires_at AND balance > 0`.

Deleting a `carnet_entries` row is the refund path (§ Refund below) — the table is append-only in the happy path but rows are removed when the presence that created them is retracted. That is a deletion of a *derived* fact whose source disappeared, not a mutation of history.

---

## Carnet code

Every carnet carries a **unique 4-character alphanumeric code** (`A7K2`, `9XQF`). It is the handle a human uses: the owner reads it off the athlete's card to pull up the right carnet, and it disambiguates "quale carnet?" when someone holds two.

Design constraints, in order of importance:

- **Unambiguous when read aloud or handwritten.** The alphabet excludes the glyph pairs that get mistaken for each other: no `0`/`O`, no `1`/`I`/`L`. What remains is `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — 31 symbols, `31^4 ≈ 923k` combinations. A code that has to be re-read twice is worse than a longer code.
- **Random, not sequential.** A counter would leak how many carnets the academy has ever sold and would make the next code guessable. Random draw from the alphabet, uppercase, stored uppercase.
- **Uniqueness is the database's job.** `UNIQUE(code)` on the table; generation draws a code and inserts, retrying on constraint violation. Same philosophy as everywhere else in this doc — the index is the guarantee, the application logic is the convenience. At realistic volume (hundreds of carnets over the life of an academy against ~923k codes) a retry is a once-in-a-career event, but the loop is three lines and removes the question entirely. Bounded at a handful of attempts, then fail loudly rather than spin.
- **Lookup is case-insensitive.** Nobody types the shift key for a code on a card.

Scope of uniqueness is the whole table, not per-academy. A Budojo install is one SQLite file for one academy in the normal case; making the code globally unique within the file costs nothing and means a code is never ambiguous even in the multi-academy install.

## Business rules

### Monthly-first, carnet frozen

**Decision (#1364):** an athlete may hold both a monthly payment and a carnet with residual entries. When presence is marked:

1. If `athlete_payments` has a row for the **attendance date's** `(year, month)` → the month is covered by the monthly fee. **No entry is consumed.** The carnet is untouched and its expiry keeps running.
2. Else, if the athlete has a carnet active on the attendance date → **consume one entry** (insert a `carnet_entries` row).
3. Else → the attendance is recorded as normal and **nothing is consumed** (§ Uncovered attendance).

The carnet is a fallback, never a parallel charge. An athlete who pays monthly and also holds a carnet burns none of it while the month is paid — which is what "congelato" means to the owner, and matches the intuition that they already paid for that month.

### The date that matters is the attendance date, not today

`MarkAttendanceAction` accepts an arbitrary `$date` — the owner backfills past sessions routinely. Every check above is therefore evaluated **against the attended date**:

- monthly coverage is looked up on the attended date's `(year, month)`, not the current month;
- carnet validity is `purchased_at <= attended_on <= expires_at`, not "valid today".

Backfilling a session from March against a carnet bought in February and expired in… still valid, consumes correctly. Backfilling a session from *before* the carnet was purchased does not consume it.

### FIFO across multiple active carnets

An athlete can hold more than one valid carnet (they bought the next one before the current ran out). Consumption picks the carnet with the **earliest `expires_at`** among those active on the attendance date — burn what expires first, so the athlete loses the fewest entries to expiry. Tie-break on `id` ascending for determinism.

### Refund on retraction

Every path that removes a presence must release the entry it consumed, or the balance leaks on the correct-a-mistake flow (soft-delete the wrong row, insert the right one — which would otherwise cost two entries for one session):

| Path | Behaviour |
|---|---|
| `DeleteAttendanceAction` (owner soft-delete) | Delete the linked `carnet_entries` row, if any. |
| `UnmarkTodayAttendanceAction` (athlete self-revert) | Same. |
| Athlete hard-deleted (GDPR erasure) | FK cascade from `attendance_records` removes the entries; the athlete's `carnets` cascade too. Nothing to do. |

The attendance row is soft-deleted (tombstone kept for audit); the carnet entry is **hard**-deleted, because a refunded entry is spendable again and must not appear in any balance. The tombstoned attendance record remains the audit trail of what happened.

### Uncovered attendance

An attendance with neither monthly coverage nor an active carnet is recorded and consumes nothing — exactly today's behaviour, since today *nothing* is ever consumed. The owner sees it in the carnet UI as "not covered" rather than being blocked at marking time.

This is deliberate and is the single most important non-goal in this PRD: presence tracking is an attendance-register concern, payment is an accounting concern, and coupling them means a rule-abiding instructor cannot record reality. If the owner later wants a warning badge, that is a UI affordance on top of this data, not a gate inside the action.

---

## Where consumption hooks in

`MarkAttendanceAction::execute()` is the single choke point where every `AttendanceRecord` is born — the athlete-side `MarkTodayAttendanceAction` delegates to it rather than inserting its own row. Consumption therefore hooks **there and only there**, and the self-mark path inherits it for free.

Two constraints on the implementation:

- **It is a bulk path.** The action marks N athletes for one date in one call. A naive per-athlete "is the month paid? / any active carnet?" pair of queries is an N+1. Both lookups are batched over `$validIds` before the insert loop: one query for the `athlete_payments` rows matching the date's `(year, month)`, one for the active carnets, both keyed by `athlete_id` — the same shape as the existing `$alreadyPresent` pre-fetch a few lines above.
- **Only newly-created records consume.** The idempotent path (`$alreadyPresent`) must not consume a second entry for a presence that already existed. The `UNIQUE(attendance_record_id)` index is the backstop if that logic is ever broken.

The consumption itself belongs in its own `ConsumeCarnetEntriesAction` (Actions/Payment), called by `MarkAttendanceAction` with the created records — attendance marking should not grow payment knowledge inline. `MarkAttendanceAction` keeps its current signature and return shape; callers are unaffected.

---

## API surface

Owner-side, under the existing academy-scoped namespace, mirroring `AthletePaymentController` conventions (Sanctum, JSON envelope, `403` on cross-academy access):

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| `GET` | `/api/v1/athletes/{athlete}/carnets` | — | `{ data: Carnet[] }` ordered `purchased_at DESC` | Each row carries `remaining_entries` + `is_active` derived fields. |
| `POST` | `/api/v1/athletes/{athlete}/carnets` | `{ purchased_at?: 'YYYY-MM-DD' }` | `201` + the created row | `purchased_at` defaults to today. `code`, `total_entries` and `price_cents` are all generated / snapshotted server-side — **never** accepted from the client. `422` if either academy config field is null. |
| `GET` | `/api/v1/athletes/{athlete}/carnets/{carnet}/entries` | — | `{ data: CarnetEntry[] }` ordered `used_on DESC` | The "which sessions did this carnet pay for" register. |

Athlete-portal, mirroring `/me/payments`:

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v1/me/carnets` | The authenticated athlete's own carnets, same shape as the owner view. |

`AthleteResource` gains a derived `active_carnet` object (`{ id, remaining_entries, expires_at }`, `null` when none) so the roster and the athlete-detail header can render a balance chip without an N+1 per row — the same technique as the existing `paid_current_month` boolean, and eager-loaded the same way on the list endpoint.

No `DELETE` on carnets in this milestone (see non-goals).

---

## FE behaviour

### Owner — athlete detail

The athlete-detail page already has a `payments-list` sub-tab (`client/src/app/features/athletes/detail/payments-list/`). Carnets land as a sibling section on that same tab rather than a new tab: the owner's mental model is "this athlete's money", not two separate ledgers, and a fourth tab would push the tab bar toward overflow on the desktop window width.

- **Balance card** at the top of the section: the **code** as the card's title in a monospaced face (`A7K2` — it is the thing the owner reads off a card and matches by eye), then "7 / 10 ingressi · scade il 12/03/2027". Empty state when no carnet: a single `[Vendi carnet]` button with the configured price inline ("Vendi carnet — 70 € / 10 ingressi"), so the owner confirms the price without opening settings.
- **Sell dialog**: date picker (`purchased_at`, defaults today, back-dateable), read-only price/entries summary, confirm. PrimeNG `p-dialog` + `p-datepicker`, consistent with the existing payment-marking dialog.
- **Entry register**: collapsed `p-accordion` listing consumed entries by date, so "where did my ten entries go" is answerable without leaving the page.

### Owner — academy settings

`carnet_price_cents` + `carnet_entries` join the existing `monthly_fee_cents` field in the academy settings form. Both empty ⇒ the carnet UI is hidden everywhere (an academy that doesn't sell carnets never sees the concept).

### Owner — roster badge

The athletes list already renders a "paid" badge from `paid_current_month`. Carnet holders get a compact entry-count chip from `active_carnet.remaining_entries` in the same cell. Low-balance (`<= 2`) and expiring-within-30-days states get the warning tone — the two moments the owner needs to say "vuoi rinnovare?" before the athlete walks out.

### Athlete portal

`my-payments` (`client/src/app/features/my-payments/`) grows a carnet card above the monthly history: residual entries, expiry date, and the consumed-sessions list. The athlete's own question is "quanti ingressi mi restano", and today they have to ask the instructor.

### i18n

Every new string lands in both `client/public/assets/i18n/it.json` and `en.json` in the same PR. The domain word stays **carnet** in Italian; English copy uses "entry pass".

---

## Edge cases

- **Carnet expires with entries left.** They are lost — no rollover, no refund. `is_active` goes false, the balance card renders the residual greyed with "scaduto". The data stays for history.
- **Presence marked, then the month is retroactively marked paid.** The entry already consumed is **not** auto-refunded — monthly-first is evaluated at marking time, not continuously. Rationale: silently rewriting a ledger on an unrelated action is worse than a one-entry discrepancy the owner can see and correct by re-marking the presence. Called out explicitly because it is the rule most likely to be questioned later.
- **Presence marked, then the month payment is deleted.** Symmetric — no retroactive consumption.
- **Backfilling a session older than the carnet purchase.** Not consumed (validity window check). The session shows as uncovered.
- **Two carnets, one expiring tomorrow with 1 entry, one fresh.** FIFO burns the expiring one. Correct — the alternative wastes it.
- **`total_entries` changed in academy settings after sales.** Snapshot per carnet; sold carnets keep their size.
- **Athlete has a monthly payment for the attended month and zero carnets.** Normal path, nothing consumed, nothing to show.
- **Carnet with 0 remaining, still inside its validity window.** Not active for consumption (balance gate), still listed in history with "esaurito".
- **Code collision at generation.** The `UNIQUE(code)` insert fails, the action redraws. Bounded retries, then a `500` rather than an infinite loop — a genuinely exhausted keyspace is a bug worth seeing, not worth papering over.

---

## Implementation slices

### PR 1 — BE data model + purchase

- Migrations: `academies.carnet_price_cents` + `carnet_entries` columns; `create_carnets_table`; `create_carnet_entries_table` (incl. the `UNIQUE(attendance_record_id)` index).
- `Carnet` + `CarnetEntry` models, `Athlete::carnets()`, `Carnet::entries()`. The balance is derived on the query side with `withCount('entries')` — **not** as model methods: `server/CLAUDE.md` keeps business logic out of models, and the "is it active" predicate waits for PR 2 (see below) rather than being written twice.
- `SellCarnetAction` (code generation + snapshot + `expires_at` computation), `ListAthleteCarnetsAction`.
- `CarnetCode` support class: the alphabet, the draw, the bounded retry-on-collision.
- `CarnetController` (index / store) + FormRequests with the cross-academy `authorize()` guard. The `entries` register endpoint moves to PR 2: until consumption exists it could only ever return `[]`.
- `AcademyController` accepts the two new config fields on `PATCH`.
- Entity docs + OpenAPI **in this PR**, not deferred — root `CLAUDE.md` requires a migration and its docs to ship in the same commit history.
- PEST: snapshotting, 422-on-unconfigured, cross-academy 403, expiry computation, balance derivation, back-dated purchase, code shape (4 chars, alphabet excludes the ambiguous glyphs), code uniqueness under a forced collision, client-supplied `code` in the payload is ignored.

### PR 2 — BE consumption + refund

- `ConsumeCarnetEntriesAction` + the batched hook in `MarkAttendanceAction`.
- Refund in `DeleteAttendanceAction` + `UnmarkTodayAttendanceAction`.
- `GET /athletes/{athlete}/carnets/{carnet}/entries` — the consumed-entry register, now that something fills it.
- `AthleteResource.active_carnet` + the eager-load on the list endpoint. `is_active` (validity window **and** balance) is introduced here as one shared predicate used by both the consumption query and the resource — PR 1 deliberately ships neither, to avoid expressing the rule twice before there is a second caller.
- `/me/carnets`.
- PEST: monthly-first freeze, FIFO selection, backfilled-date coverage lookup, refund-on-delete, correct-a-mistake costs one entry, idempotent re-mark consumes nothing, over-draw refused, bulk-mark query count (no N+1).

### PR 3 — FE owner surfaces

- Carnet section in `payments-list` (balance card, sell dialog, entry register).
- Academy settings fields.
- Roster chip + low-balance / expiring tones.
- i18n both locales. Vitest for the balance/expiry presentation logic and the dialog flow.

### PR 4 — FE athlete portal + E2E + docs

- `my-payments` carnet card.
- Cypress: owner sells a carnet → marks presence on an unpaid month → balance drops → deletes the presence → balance restored.
- Docs catch-up for whatever PR 2 and PR 3 changed — `attendance-record.md` (the consumption side-effect), `athlete-payment.md` (cross-link the coexistence rule), `AthleteResource.active_carnet` in the OpenAPI. The carnet entity docs and the sell/list endpoints already shipped in PR 1.

---

## Open items (raise before / during PR 1)

- **Is 12 months fixed, or academy-configurable?** This PRD hardcodes 12 (stored per carnet at purchase, so making it configurable later is additive and doesn't touch sold rows). Confirm before the migration lands.
- **Is the code searchable?** The repo has a global search surface (`app/Actions/Search`). Typing `A7K2` there and landing on the athlete holding it is the obvious affordance, but it is additive and not required for the code to do its job. Decide in PR 3 when the UI exists.
- **Notification on low balance.** The notification infrastructure exists (`AthletePaymentMarkedPaidNotification` is the template) and "2 ingressi rimasti" is an obvious candidate. Deliberately out of this PRD's slices — its own ticket once the balance data exists.
- ~~**Stats.** `GET /stats/payments/monthly` buckets revenue by the business month of `athlete_payments`. A carnet sale is revenue on `purchased_at` that covers 12 months of unknown usage, so it does **not** belong in that series without a decision on how to attribute it. Left out of scope; the trend endpoint keeps meaning "monthly-fee revenue" until that decision is made.~~ **Settled in #1383:** the decision was taken to spread a carnet's `price_cents` evenly across the months of its validity window, which is the same rule #1382 applies to a twelve-month fee payment. The trend endpoint now means "all revenue for this month" — fees and carnets alike. See [`carnet.md`](../entities/carnet.md) § Business rules.
