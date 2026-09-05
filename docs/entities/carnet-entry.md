# Entity — `CarnetEntry`

## Purpose

One consumed entry from a [`Carnet`](./carnet.md), pinned to the `AttendanceRecord` that consumed it. This table is the **ledger** the residual balance is counted from — a carnet's remaining entries are `carnets.total_entries` minus the number of rows here.

Storing consumption as a ledger rather than decrementing a counter is the central design decision of the carnet feature: a counter is a derived value pretending to be a fact, and any path that fails to update it corrupts the balance with no way to detect the drift.

**Since #1380 the table is a projection, not a log.** It shipped as an append-only record written when a presence was marked, which meant sessions predating the sale were never looked at again — the defect that made a carnet sold on 4 September ignore the session on the 2nd. What a carnet pays for is now a function of its window, so the ledger is *rebuilt from the facts* by `ReconcileCarnetEntriesAction` rather than accumulated by events.

## Schema — `carnet_entries`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `carnet_id` | bigint unsigned | FK `carnets.id`, cascade on delete | The carnet this entry was drawn from |
| `attendance_record_id` | bigint unsigned | FK `attendance_records.id`, cascade on delete, **UNIQUE** | The presence that consumed it |
| `used_on` | date | not null | Denormalised copy of `attendance_records.attended_on`, so the ledger reads without joining attendance |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

### Why `UNIQUE(attendance_record_id)` still matters

It makes "one attendance consumes at most one entry" a property of the schema rather than of the code — now doubly useful, since a reconciliation that computed two assignments for one session would fail loudly instead of silently double-charging. Same technique as the `UNIQUE(athlete_id, year, month)` index behind `RecordAthletePaymentAction`.

(Budojo also ships as a local-first single-tenant desktop app on SQLite, so there is no concurrent-terminal scenario to defend against in the first place — but the constraint is the guarantee regardless of deployment shape.)

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(attendance_record_id)` — see above
- Implicit index on `carnet_id` from the foreign key

## Relations

- `belongsTo(Carnet::class)` — exposed as `entry->carnet`
- `belongsTo(AttendanceRecord::class)` — exposed as `entry->attendanceRecord`
- Inverse: `Carnet::entries()` returns `HasMany<CarnetEntry>`

## Business rules

- **Monthly-first, carnet frozen.** A session in a month covered by an `athlete_payments` row consumes nothing. The carnet is a fallback, never a parallel charge — and since #1380 this is evaluated from the facts, so *paying a month afterwards releases the entries it had taken*. Under the event model that discrepancy was accepted on purpose; once the balance is a function of its inputs, freezing it would be the anomaly.
- **The attended date is the date that matters.** Both the monthly-coverage lookup and the carnet window are evaluated against `attendance_records.attended_on`, never against today.
- **FIFO across carnets.** When an athlete holds more than one valid carnet, the entry comes off the one expiring soonest, so they lose the fewest entries to expiry. Ties break on `id`.
- **Never overdrawn.** A carnet with no entries left is not spendable, even inside its validity window. `CarnetAvailability::isActiveOn` is the single expression of that rule; the `UNIQUE(attendance_record_id)` index is the structural backstop against one presence consuming twice.
- **Re-marking is free.** `MarkAttendanceAction` hands the consumer only the rows it just created, so marking an already-present athlete again charges nothing.
- **Hard delete on refund.** Removing a presence deletes its entry, because a refunded entry is spendable again and must not appear in any balance. The attendance row itself is only *soft*-deleted, so the tombstone remains the audit trail of what happened. Without this, the ordinary correct-a-mistake flow (soft-delete the wrong row, insert the right one) would cost two entries for one session.
- **Athlete erasure cascades.** Hard-deleting an athlete cascades through `attendance_records` and `carnets` and takes the entries with it, consistent with the GDPR Art. 17 flow.

## Where the writes happen

Every input that can move the result runs `ReconcileCarnetEntriesAction` afterwards, in the same transaction as the change. A wider blast radius than the old event model, and the price of the balance being correct rather than merely consistent with the order things happened in.

| Path | Why it moves the result |
|---|---|
| `MarkAttendanceAction` | A new session may fall in a carnet's window. Batched: carnets, sessions, payments and the existing ledger are one query each for the whole bulk mark, so twenty athletes cost what one does plus the writes. |
| `DeleteAttendanceAction` / `UnmarkTodayAttendanceAction` | The session leaves the set the ledger derives from. There is no explicit refund any more — and another carnet may pick up a different session as a result, which is why the whole athlete is recomputed. |
| `SellCarnetAction` | A carnet dated into the past is owed sessions the register already holds. |
| `UpdateCarnetValidityAction` | Moving the window claims or releases sessions at either end. |
| `DeleteCarnetAction` | Its sessions fall back to another carnet, or to uncovered. |
| `RecordAthletePaymentAction` / `DeleteAthletePaymentAction` | The monthly fee's precedence is derived, so adding or undoing a payment changes what the carnet owes. |

## Related tables

- `carnets` — see [`carnet.md`](./carnet.md)
- `attendance_records` — see [`attendance-record.md`](./attendance-record.md)
