# Entity — `AthletePayment`

## Purpose

Records that an `Athlete` has paid the academy's monthly membership fee for a specific (year, month). The roster page renders a "paid" badge per athlete from these rows; the per-athlete payment history view (M5) lists them chronologically.

This is the explicit **fact-of-payment** ledger. Marking a month "paid" creates one row; marking it "unpaid" deletes it. The table is hard-deleted (no soft-delete) — the absence of a row IS the canonical "not paid" state, indistinguishable from a payment that never happened.

## Schema — `athlete_payments`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete | Athlete this payment belongs to. Cascade-on-delete ensures payments vanish with the athlete |
| `year` | unsigned smallint | not null | The calendar year of the membership month being paid (e.g. `2026`) |
| `month` | unsigned tinyint | not null | The calendar month being paid, 1-12. Validated at the request layer (`between:1,12`) — the column type allows 0-255 |
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

## Business rules

- **Idempotent recording.** `POST /athletes/{id}/payments` with the same `{year, month}` twice returns the *same* row both times — the action does a "find first, return if exists" check before insert. The DB unique index is the safety net.
- **`amount_cents` is snapshotted, not derived.** When a payment is recorded, we copy whatever `App\Support\MonthlyFee::forAthlete()` resolves into the row at that moment. If the academy raises the fee — or re-prices the athlete's tier, or moves them to a different one — paid history doesn't suddenly show different amounts. This is why the price list (#1381) shipped without migrating a single past payment.
- **Cannot record without a configured fee.** `POST` returns `422 Unprocessable Entity` with the error key `monthly_fee_cents` when **no fee applies to this athlete** — that is, they are on no price tier *and* `academies.monthly_fee_cents` is `null` (#1381). An athlete on a tier is payable even when the academy has no flat fee at all, and an academy on a flat fee is payable with no tiers configured. The owner sets a flat fee via `PATCH /api/v1/academy` or adds a tier via `POST /api/v1/academy/fee-tiers`; see [`academy-fee-tier.md`](./academy-fee-tier.md).
- **Hard delete.** `DELETE /athletes/{id}/payments/{year}/{month}` removes the row — there is no soft-delete tombstone. The absence of a row IS "not paid"; we don't differentiate "never paid" from "paid then unmarked" at the data layer. Audit trail, if ever required, would live in a separate `payment_events` log.
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
