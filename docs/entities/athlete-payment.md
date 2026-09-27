# Entity — `AthletePayment`

## Purpose

Records that an `Athlete` has paid the academy's monthly membership fee for a specific (year, month). The roster page renders a "paid" badge per athlete from these rows; the per-athlete payment history view (M5) lists them chronologically.

This is the explicit **fact-of-payment** ledger. Marking a month "paid" creates one row; marking it "unpaid" deletes it. The table is hard-deleted (no soft-delete) — the absence of a row IS the canonical "not paid" state, indistinguishable from a payment that never happened.

## Schema — `athlete_payments`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete | Athlete this payment belongs to. Cascade-on-delete ensures payments vanish with the athlete |
| `year` | unsigned smallint | not null | Calendar year the covered period **starts** in (e.g. `2026`). Until #1382 this was "the year being paid for", which is the same sentence for a monthly payment |
| `month` | unsigned tinyint | not null | Calendar month the covered period **starts** in, 1-12. Validated at the request layer (`between:1,12`) — the column type allows 0-255 |
| `period_months` | unsigned tinyint | not null, default `1` | How many months this one payment covers (#1382). Backed by [`BillingPeriod`](#billingperiod): `1` monthly, `3` quarterly, `6` half-yearly, `12` annual. The default of `1` is what makes every pre-#1382 row correct without a backfill |
| `amount_cents` | unsigned int | not null | Snapshot of **the fee that applied to this athlete** at the moment the payment was recorded — `App\Support\MonthlyFee::forAthlete()`: their own `athletes.fee_override_cents` if set (#1757), else their price tier's amount, else `academies.monthly_fee_cents` (#1381). `0` for an athlete who trains free. Future fee, tier, or tier-membership changes do NOT rewrite this value |
| `paid_at` | timestamp | not null | **When the money arrived** (#1761) — a business date: September's fee handed over on 3 October is `2026-10-03`. Sent as `Y-m-d` (`date_format`, not `date`, so a zoned datetime cannot land on the neighbouring day), never in the future, and stored as the **start of that day** (UTC). Not sent, it is **the owner's today** (#1963, `App\Support\OperatorDay`: the day in the operator's timezone, not UTC's), stored the same way. Rows from before #1761 hold the moment of recording instead, so read the column as a date, never a time. It is the transaction's date, **never** the month the revenue belongs to — see Business rules |
| `payment_method` | string(16) | nullable | How it was paid (#1761): [`PaymentMethod`](#paymentmethod). **Null is "not recorded"** — every row written before #1761 is null and stays null; nothing is backfilled with a guess, and the field stays optional |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

## Relations

- `belongsTo(Athlete::class)` — exposed as `payment->athlete`
- Inverse: `Athlete::payments()` returns `HasMany<AthletePayment>`

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(athlete_id, year, month)` — enforces one payment per (athlete, month). The DB-level guarantee is what makes `RecordAthletePaymentAction` idempotency safe — even under concurrent `POST` racers, only one row is ever stored per (athlete, year, month)
- Implicit index on `athlete_id` from the foreign key

## `BillingPeriod`

`App\Enums\BillingPeriod`, an int-backed enum whose value **is** the month count — the coverage rule does arithmetic on it, not a lookup.

| Case | Value | Meaning |
|---|---|---|
| `Monthly` | `1` | One month. What every payment was before #1382 |
| `Quarterly` | `3` | Three months from the start month |
| `HalfYearly` | `6` | Six months |
| `Annual` | `12` | Twelve months |

Naming four cases rather than accepting any integer keeps the picker short and keeps "somebody paid for seven months" out of the data.

## `PaymentMethod`

`App\Enums\PaymentMethod` (#1761), string-backed, shared by `athlete_payments.payment_method` and `carnets.payment_method`. It is what tells the money that went through the bank from the money in the drawer — the difference between "revenue for September" and "what I have to reconcile".

| Case | Value | Meaning |
|---|---|---|
| `Cash` | `cash` | Contanti |
| `Transfer` | `transfer` | A bank transfer (bonifico) |
| `Pos` | `pos` | A card, through the gym's terminal |
| `Other` | `other` | Anything else — a voucher, a mix |

Four cases and no free text: the list stays short enough to pick from at the end of an evening, and a year of rows can be summed by method.

## Business rules

- **A payment covers a period, not a month (#1382).** `(year, month)` is where the period **starts**; it runs `period_months` from there and may cross a year boundary. Every "does a payment cover this month?" question goes through `AthletePayment::scopeCovering(year, month)` — the twelve-month table, `paid_current_month`, the months the fee covers during carnet reconciliation, and the payment branch of `Athlete::scopeOwing`. That scope is the whole "who owes" rule the `?paid` filter, the owner's digest and the overdue push read: a spendable carnet (`Carnet::scopeSpendableOn`) and a fee to pay count too (#1722, see [`athlete.md`](./athlete.md)). A caller writing the arithmetic itself is how two surfaces come to disagree.
- **The period runs from its start month, not from a calendar quarter.** An athlete who pays quarterly in February is covered February–April. That is what happens in a gym, and it removes the pro-rata first period, which would be a feature of its own.
- **Idempotent recording.** `POST /athletes/{id}/payments` with the same `{year, month, period_months}` twice returns the *same* row both times — the action does a "find first, return if exists" check before insert. The DB unique index is the safety net. Re-posting the same start month with a **different** length is refused instead: the caller is asking for something else, and silently handing back the quarterly would claim the athlete paid for a year.
- **Overlap is rejected in the Action, not by the schema (#1382).** `UNIQUE(athlete_id, year, month)` used to carry this invariant on its own, because a row *was* a month. It cannot any more: a March monthly and a February quarterly start in different months and both cover March. `RecordAthletePaymentAction::rejectOverlap()` refuses the second with a 422 on `period_months`, inside the same transaction as the insert so the read and the write cannot interleave. Losing a structural guarantee to an application check is a real cost, and it is written down here so nobody assumes the index still covers it.
- **Adjacent periods are fine.** Jan–Mar then Apr–Jun do not overlap; rejecting them would make renewing impossible.
- **`paid_at` does not decide which month the revenue belongs to (#1761).** The month is `(year, month)` and the period; `paid_at` is when the money changed hands. September's fee marked on 3 October is September revenue with an October date. `MonthlyPaymentsStatsAction` buckets by the covered months, and bucketing by `paid_at` instead would silently redefine every historical figure on the chart and in the money tiles. "What arrived in October" is a different question — the accountant's export answers it (#1762).
- **The date and the method are values, not the key.** `RecordAthletePaymentAction` writes them in the *values* of `createOrFirst`; the idempotency key stays `(athlete_id, year, month)`. A re-post of the same month returns the first row **with its first date and method** — the double-click must not move the date, and must never create a second row.
- **The method is optional, forever.** A required field would turn a two-tap mark-paid into a form, and the owner marks in batches at the end of the evening. Neither field touches carnet reconciliation (#1380): the transaction boundary is unchanged.
- **`amount_cents` is snapshotted, not derived.** When a payment is recorded, we copy whatever `App\Support\MonthlyFee::forAthlete()` resolves **times `period_months`** (#1382) into the row at that moment. There is deliberately nowhere to record a *discounted* annual — Budojo does not model a per-period price, and half-modelling it would be worse than the gap. Revisit if an academy asks. If the academy raises the fee — or re-prices the athlete's tier, or moves them to a different one — paid history doesn't suddenly show different amounts. This is why the price list (#1381) shipped without migrating a single past payment.
- **Cannot record without a configured fee.** `POST` returns `422 Unprocessable Entity` with the error key `monthly_fee_cents` when **no fee applies to this athlete**: no personal fee, no price tier *and* `academies.monthly_fee_cents` `null` (#1381, #1757). An athlete with a personal fee or on a tier is payable even when the academy has no flat fee at all, and an academy on a flat fee is payable with no tiers configured. A personal fee of `0` is a fee that applies: the payment is recorded at 0. The owner sets a flat fee via `PATCH /api/v1/academy` or adds a tier via `POST /api/v1/academy/fee-tiers`; see [`academy-fee-tier.md`](./academy-fee-tier.md).
- **Undoing removes the whole period.** `DELETE /athletes/{id}/payments/{year}/{month}` deletes the payment **covering** that month, whichever month its period started in — the owner looking at April clicks unmark and the February quarterly comes off. Keying on the start month would make a quarterly undeletable from two of the three months it pays for. One payment, one receipt, one deletion: releasing a single month would leave the amount no longer matching what it covers, and a partial refund is an accounting event Budojo does not model.
- **Hard delete.** That endpoint removes the row — there is no soft-delete tombstone. The absence of a row IS "not paid"; we don't differentiate "never paid" from "paid then unmarked" at the data layer. Audit trail, if ever required, would live in a separate `payment_events` log.
- **A paid month keeps the athlete's carnet out of it (#1364).** A row here for an attended `(year, month)` means no carnet entry is charged for that month's sessions — the monthly fee already covers them, and the carnet is a fallback rather than a parallel charge. Since #1380 this is **re-evaluated every time**, not frozen at marking: `ReconcileCarnetEntriesAction` rebuilds the ledger from the facts, so marking a month paid releases the entries it had consumed and deleting the payment charges them again. See [`carnet-entry.md`](./carnet-entry.md).
- **Arrears are the unpaid months before this one, from the billing floor (#1760).** `GET /stats/payments/arrears` (`PaymentsArrearsAction`) lists, per athlete, every month from `BillingFloor` (the later of `academies.billing_from` and the joining month) up to **last** month that nothing paid for. It never counts the current month: that belongs to the unpaid chip and its day-16 digest, and two surfaces counting it differently is how a tile and a list disagree. It reuses the rules above instead of restating them:
  - **Who** is the `owing` population (active, expected to pay) with a fee above zero (`scopeChargedMoreThanNothing`), so a personal fee of `0` (#1757) never has arrears.
  - **What pays a past month** is `Athlete::scopePaidDuring`, the month-long twin of `paidFor`: a covering payment, or a carnet spendable on some day of the month (`Carnet::scopeSpendableDuring`). The carnet is judged as it stood then: its window must touch the month (a carnet that expired on 31 August paid for August), and its balance counts only the entries spent before the first day of the month it was valid. Today's balance would call every carnet spent out since then unpaid for the months it paid.
  - **How much** is `months_behind` × the athlete's fee **today** (`MonthlyFee`): an estimate, because nothing records what the fee was in a past month.
  - **Known gap:** an athlete who left and came back carries arrears for the months they were away. `status_changed_at` (#1741) records only the last change, and the page says so under the list.
- **Cross-academy ownership.** All endpoints reject `403 Forbidden` when the targeted athlete belongs to a different academy than the caller. Enforced in `StoreAthletePaymentRequest::authorize()` for `POST` and inline in the controller for `GET` / `DELETE`.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/payments?year=YYYY` — list payments for the year (default = current year), ordered by month asc
- `POST /api/v1/athletes/{athlete}/payments` — record a payment (body: `{year, month, period_months?, paid_at?, payment_method?}`); returns 201 with the row (existing or new)
- `DELETE /api/v1/athletes/{athlete}/payments/{year}/{month}` — undo a paid month; 404 if no row exists, 204 on success

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `academies` — see [`academy.md`](./academy.md) (specifically the `monthly_fee_cents` field)

## Stats aggregation — monthly revenue trend

`GET /api/v1/stats/payments/monthly` (defined in the `Stats` group of `routes/api_v1.php`, served by `MonthlyPaymentsStatsAction`) buckets revenue by the **business month(s)** the fee covers — NOT by `paid_at` (the day the money arrived, #1761).

Since #1382 a payment covers a period, so its `amount_cents` is **spread evenly across every month that period pays for**: a €165 quarterly contributes €55 to each of three buckets rather than €165 to one. Booking it whole would make an academy that bills quarterly read €0 for two months in three, against the "revenue *for* this month" promise below. The split is integer with the remainder on the first month, so the buckets always add back up to what was actually paid. It is done in PHP — SQL cannot expand one row into three buckets without a calendar table — and the query pulls every payment whose period *overlaps* the window, not just those starting inside it.

**Carnets are on the same axis under a different rule (#1383, changed in #1553).** A pack lands **whole in the month it was sold**, keyed on `purchased_at` — not `valid_from`: a carnet bought in August to start in September is August's takings. It was spread across its validity window until #1553, which made a sale invisible: €70 valid twelve months moved the chart by €5.83, and the owner who had just taken €70 could not find it. A carnet is a lump the academy either took or did not; a fee is an entitlement that accrues. Two rules on one chart, deliberately, and the SPA's hint says so. Attributing the money to the months entries are actually *consumed* was considered and rejected: it rewrites past months every time a back-dated presence is marked, and never books an entry nobody used. See [`carnet.md`](./carnet.md).

**Both rules live in one place, `App\Support\CollectedByMonth` (#1758),** which the chart and the money summary below both read, so a bar and a tile for the same month cannot show two numbers.

The covered month and `paid_at` diverge since #1761, which lets the owner date a payment the day the money arrived: September's fee paid on 3 October stays in the September bucket. The chart label "Monthly revenue" always means *revenue **for** this month*, not *revenue **received in** this month*. Consumers building UI on top of this endpoint should respect that semantic.

Because `amount_cents` is snapshotted at insert time (see Business rules above), historical sums returned by the trend endpoint stay stable against future changes to `academies.monthly_fee_cents`.

The endpoint does NOT split by payment status today — the schema currently has no `payment_status` column (only paid rows exist as records). When that schema grows, the response can extend to a stacked split without breaking clients (additive change).

## Stats aggregation — one month's money: expected, collected, outstanding

`GET /api/v1/stats/payments/summary?year=&month=` (`PaymentsSummaryAction`, #1758) states the four figures the chart implies: what the month should have brought in, what it did, who is still out and for how much. Each definition is composed from a rule that already exists, never restated:

- **Population** — active, `Athlete::scopeExpectedToPay` (not the owner, a fee applies) and `scopeChargedMoreThanNothing` (it resolves above zero). An athlete on a zero `fee_override_cents` trains free and is on neither side of the rate. Only from `App\Support\BillingFloor` on (#1742): the later of the month they joined and the academy's `billing_from`.
- **Expected** — Σ `MonthlyFee::forAthlete()` over the population: **one month's worth per athlete**, whatever `billing_period_months` says. An annual payer adds a twelfth of the year: the tile compares a month with a month.
- **Collected** — the chart's own bucket for that month, from `CollectedByMonth`: a quarterly paid in September contributes only its September third, a carnet counts whole in its sale month, and money from anyone counts.
- **Outstanding** — the population with nothing paying for the month, and Σ their monthly fee. The current month asks `Athlete::scopeOwing` (no covering fee, no carnet spendable today, #1722); a month already over asks `Athlete::scopePaidDuring` (a carnet spendable on some day of it, at the balance the month began with, #1760) — the arrears list's rule and split, so a past month's outstanding is exactly who the list says was behind in it.
- **Rate** — collected ÷ expected, by money not by heads; `null` when nothing is expected. It can exceed 1.
- **`estimated`** — true for every month but the current one. What paid for a past month is history, carnet balances included; who was expected to pay and how much is not. There is no status or tier history on `athletes`, so a past month is read against today's roster at today's fees — the same estimate the arrears list makes of its amounts.

## Resource-level derivation: `paid_current_month` and `payment_coverage`

`AthleteResource` exposes two derived fields so the SPA roster can render a row without a per-row payments call. The list endpoint (`GET /athletes`) eager-loads only the slice of payments that could cover the current month — `AthletePayment::scopeCovering(year, month)`, **not** an equality on `(year, month)`, since #1382 — which keeps both derivations O(1) per row instead of N+1.

Both come from **one lookup**: the resource reads the covering payment itself and derives the boolean from it, so the two cannot drift.

| Field | Says |
|---|---|
| `paid_current_month` | Whether a **fee payment** covers the month. A carnet does not make this true. It is what the row's paid / unpaid toggle reads. It used to be what the `?paid` filter and both reminders read too, which is how a carnet holder came to be chased; **who owes** is now `Athlete::scopeOwing`, the same answer as `payment_coverage: none` (#1722, see [`athlete.md`](./athlete.md)). |
| `payment_coverage` | **How** the month is covered (#1402): `monthly` / `quarterly` / `half_yearly` / `annual` / `carnet` / `none`. Resolved by `App\Support\MonthCoverage`, where the fee's precedence over a carnet is read from the rule the ledger already applies (#1380) rather than restated. |

The roster renders `payment_coverage`; the boolean stayed because it answers a different, narrower question and several surfaces depend on that.
