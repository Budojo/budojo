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
| `amount_cents` | unsigned int | not null | Snapshot of `academies.monthly_fee_cents` at the moment the payment was recorded. Future fee changes do NOT rewrite this value |
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
- **`amount_cents` is snapshotted, not derived.** When a payment is recorded, we copy `academies.monthly_fee_cents` into the row at that moment. If the academy raises the fee next month, paid history doesn't suddenly show retroactively-higher amounts.
- **Cannot record without a configured fee.** If `academies.monthly_fee_cents` is `null`, `POST` returns `422 Unprocessable Entity` with the error key `monthly_fee_cents`. The owner must set the fee via `PATCH /api/v1/academy` first.
- **Hard delete.** `DELETE /athletes/{id}/payments/{year}/{month}` removes the row — there is no soft-delete tombstone. The absence of a row IS "not paid"; we don't differentiate "never paid" from "paid then unmarked" at the data layer. Audit trail, if ever required, would live in a separate `payment_events` log.
- **Cross-academy ownership.** All endpoints reject `403 Forbidden` when the targeted athlete belongs to a different academy than the caller. Enforced in `StoreAthletePaymentRequest::authorize()` for `POST` and inline in the controller for `GET` / `DELETE`.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/payments?year=YYYY` — list payments for the year (default = current year), ordered by month asc
- `POST /api/v1/athletes/{athlete}/payments` — record a payment (body: `{year, month}`); returns 201 with the row (existing or new)
- `DELETE /api/v1/athletes/{athlete}/payments/{year}/{month}` — undo a paid month; 404 if no row exists, 204 on success

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `academies` — see [`academy.md`](./academy.md) (specifically the `monthly_fee_cents` field)

## Resource-level derivation: `paid_current_month`

`AthleteResource` exposes a derived boolean `paid_current_month` so the SPA roster page can render the "paid" badge without a per-row payments-list call. The list endpoint (`GET /athletes`) eager-loads only the current-month payments slice (`WHERE year = NOW()->year AND month = NOW()->month`) to keep this derivation O(1) per row instead of N+1.
