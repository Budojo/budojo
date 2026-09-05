# Entity — `CarnetEntry`

## Purpose

One consumed entry from a [`Carnet`](./carnet.md), pinned to the `AttendanceRecord` that consumed it. This table is the **ledger** the residual balance is counted from — a carnet's remaining entries are `carnets.total_entries` minus the number of rows here.

Storing consumption as an append-only ledger rather than decrementing a counter is the central design decision of the carnet feature: a counter is a derived value pretending to be a fact, and any path that fails to update it corrupts the balance with no way to detect the drift. Counting rows cannot drift, because there is nothing to keep in sync.

## Schema — `carnet_entries`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `carnet_id` | bigint unsigned | FK `carnets.id`, cascade on delete | The carnet this entry was drawn from |
| `attendance_record_id` | bigint unsigned | FK `attendance_records.id`, cascade on delete, **UNIQUE** | The presence that consumed it |
| `used_on` | date | not null | Denormalised copy of `attendance_records.attended_on`, so the ledger reads without joining attendance |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

### Why `UNIQUE(attendance_record_id)` matters

It makes "one attendance consumes at most one entry" a property of the schema rather than of the code. That is what removes the need for pessimistic locking around consumption: a duplicate consumption attempt fails on the constraint instead of racing for a lock. It is the same technique as the `UNIQUE(athlete_id, year, month)` index that makes `RecordAthletePaymentAction` safe.

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

- **Monthly-first, carnet frozen.** A presence falling in a month covered by an `athlete_payments` row consumes nothing. The carnet is a fallback, never a parallel charge.
- **The attended date is the date that matters.** Both the monthly-coverage lookup and the carnet validity window are evaluated against `attendance_records.attended_on`, not against today — the owner back-fills past sessions routinely. A session from March is judged by the coverage that was in force in March.
- **FIFO across carnets.** When an athlete holds more than one valid carnet, the entry comes off the one expiring soonest, so they lose the fewest entries to expiry. Ties break on `id`.
- **Never overdrawn.** A carnet with no entries left is not spendable, even inside its validity window. `CarnetAvailability::isActiveOn` is the single expression of that rule; the `UNIQUE(attendance_record_id)` index is the structural backstop against one presence consuming twice.
- **Re-marking is free.** `MarkAttendanceAction` hands the consumer only the rows it just created, so marking an already-present athlete again charges nothing.
- **Hard delete on refund.** Removing a presence deletes its entry, because a refunded entry is spendable again and must not appear in any balance. The attendance row itself is only *soft*-deleted, so the tombstone remains the audit trail of what happened. Without this, the ordinary correct-a-mistake flow (soft-delete the wrong row, insert the right one) would cost two entries for one session.
- **Athlete erasure cascades.** Hard-deleting an athlete cascades through `attendance_records` and `carnets` and takes the entries with it, consistent with the GDPR Art. 17 flow.

## Where the writes happen

| Path | Action |
|---|---|
| `MarkAttendanceAction` | `ConsumeCarnetEntriesAction` charges the freshly created rows, in the same transaction as the inserts. Coverage and candidate carnets are each fetched once for the whole batch, so the owner's daily bulk mark does not fan out per athlete. |
| `DeleteAttendanceAction` | `ReleaseCarnetEntryAction` gives the entry back, in the same transaction as the soft-delete. |
| `UnmarkTodayAttendanceAction` | Same release, for the athlete-portal self-revert. |

## Related tables

- `carnets` — see [`carnet.md`](./carnet.md)
- `attendance_records` — see [`attendance-record.md`](./attendance-record.md)
