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
| `amount_cents` | unsigned int | not null | Snapshot of **the fee that applied to this athlete** at the moment the payment was recorded — `App\Support\MonthlyFee::forAthlete()`: their price tier's amount if they are on one, `academies.monthly_fee_cents` otherwise (#1381). Future fee, tier, or tier-membership changes do NOT rewrite this value |
| `paid_at` | timestamp | not null | Wall-clock time the payment was recorded. Today equal to `created_at`; kept as a separate column so a future "back-date a payment" feature has somewhere to store the business date |
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

## Business rules

- **A payment covers a period, not a month (#1382).** `(year, month)` is where the period **starts**; it runs `period_months` from there and may cross a year boundary. Every "is this month covered?" question goes through `AthletePayment::scopeCovering(year, month)` — the twelve-month table, `paid_current_month`, the `?paid` filter, the unpaid widget, the owner's digest, the overdue push, and the months the fee covers during carnet reconciliation. A caller writing the arithmetic itself is how two surfaces come to disagree.
- **The period runs from its start month, not from a calendar quarter.** An athlete who pays quarterly in February is covered February–April. That is what happens in a gym, and it removes the pro-rata first period, which would be a feature of its own.
- **Idempotent recording.** `POST /athletes/{id}/payments` with the same `{year, month, period_months}` twice returns the *same* row both times — the action does a "find first, return if exists" check before insert. The DB unique index is the safety net. Re-posting the same start month with a **different** length is refused instead: the caller is asking for something else, and silently handing back the quarterly would claim the athlete paid for a year.
- **Overlap is rejected in the Action, not by the schema (#1382).** `UNIQUE(athlete_id, year, month)` used to carry this invariant on its own, because a row *was* a month. It cannot any more: a March monthly and a February quarterly start in different months and both cover March. `RecordAthletePaymentAction::rejectOverlap()` refuses the second with a 422 on `period_months`, inside the same transaction as the insert so the read and the write cannot interleave. Losing a structural guarantee to an application check is a real cost, and it is written down here so nobody assumes the index still covers it.
- **Adjacent periods are fine.** Jan–Mar then Apr–Jun do not overlap; rejecting them would make renewing impossible.
- **`amount_cents` is snapshotted, not derived.** When a payment is recorded, we copy whatever `App\Support\MonthlyFee::forAthlete()` resolves **times `period_months`** (#1382) into the row at that moment. There is deliberately nowhere to record a *discounted* annual — Budojo does not model a per-period price, and half-modelling it would be worse than the gap. Revisit if an academy asks. If the academy raises the fee — or re-prices the athlete's tier, or moves them to a different one — paid history doesn't suddenly show different amounts. This is why the price list (#1381) shipped without migrating a single past payment.
- **Cannot record without a configured fee.** `POST` returns `422 Unprocessable Entity` with the error key `monthly_fee_cents` when **no fee applies to this athlete** — that is, they are on no price tier *and* `academies.monthly_fee_cents` is `null` (#1381). An athlete on a tier is payable even when the academy has no flat fee at all, and an academy on a flat fee is payable with no tiers configured. The owner sets a flat fee via `PATCH /api/v1/academy` or adds a tier via `POST /api/v1/academy/fee-tiers`; see [`academy-fee-tier.md`](./academy-fee-tier.md).
- **Undoing removes the whole period.** `DELETE /athletes/{id}/payments/{year}/{month}` deletes the payment **covering** that month, whichever month its period started in — the owner looking at April clicks unmark and the February quarterly comes off. Keying on the start month would make a quarterly undeletable from two of the three months it pays for. One payment, one receipt, one deletion: releasing a single month would leave the amount no longer matching what it covers, and a partial refund is an accounting event Budojo does not model.
- **Hard delete.** That endpoint removes the row — there is no soft-delete tombstone. The absence of a row IS "not paid"; we don't differentiate "never paid" from "paid then unmarked" at the data layer. Audit trail, if ever required, would live in a separate `payment_events` log.
- **A paid month keeps the athlete's carnet out of it (#1364).** A row here for an attended `(year, month)` means no carnet entry is charged for that month's sessions — the monthly fee already covers them, and the carnet is a fallback rather than a parallel charge. Since #1380 this is **re-evaluated every time**, not frozen at marking: `ReconcileCarnetEntriesAction` rebuilds the ledger from the facts, so marking a month paid releases the entries it had consumed and deleting the payment charges them again. See [`carnet-entry.md`](./carnet-entry.md).
- **Cross-academy ownership.** All endpoints reject `403 Forbidden` when the targeted athlete belongs to a different academy than the caller. Enforced in `StoreAthletePaymentRequest::authorize()` for `POST` and inline in the controller for `GET` / `DELETE`.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/payments?year=YYYY` — list payments for the year (default = current year), ordered by month asc
- `POST /api/v1/athletes/{athlete}/payments` — record a payment (body: `{year, month}`); returns 201 with the row (existing or new)
- `DELETE /api/v1/athletes/{athlete}/payments/{year}/{month}` — undo a paid month; 404 if no row exists, 204 on success

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `academies` — see [`academy.md`](./academy.md) (specifically the `monthly_fee_cents` field)

## Stats aggregation — monthly revenue trend

`GET /api/v1/stats/payments/monthly` (defined in the `Stats` group of `routes/api_v1.php`, served by `MonthlyPaymentsStatsAction`) buckets revenue by the **business month** stored on `(year, month)` — the month the fee covers — NOT by `paid_at` (the wall-clock recording time).

The two values are typically equal today because the API does not accept a custom `paid_at`. They can diverge the day a "back-date a payment" feature ships. The chart label "Monthly revenue" always means *revenue **for** this month*, not *revenue **received in** this month*. Consumers building UI on top of this endpoint should respect that semantic.

Because `amount_cents` is snapshotted at insert time (see Business rules above), historical sums returned by the trend endpoint stay stable against future changes to `academies.monthly_fee_cents`.

The endpoint does NOT split by payment status today — the schema currently has no `payment_status` column (only paid rows exist as records). When that schema grows, the response can extend to a stacked split without breaking clients (additive change).

## Resource-level derivation: `paid_current_month`

`AthleteResource` exposes a derived boolean `paid_current_month` so the SPA roster page can render the "paid" badge without a per-row payments-list call. The list endpoint (`GET /athletes`) eager-loads only the current-month payments slice (`WHERE year = NOW()->year AND month = NOW()->month`) to keep this derivation O(1) per row instead of N+1.
