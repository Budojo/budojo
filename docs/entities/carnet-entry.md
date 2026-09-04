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

> **Status**: the table ships with the carnet data model (#1364 PR 1). Nothing writes to it yet — consumption on attendance and the refund-on-retraction paths land in PR 2. Until then every carnet reads at full balance, which is correct.

The rules the ledger will be written under, per [`docs/specs/entry-carnets.md`](../specs/entry-carnets.md):

- **Monthly-first, carnet frozen.** A presence falling in a month covered by an `athlete_payments` row consumes nothing. The carnet is a fallback, never a parallel charge.
- **The attended date is the date that matters.** Both the monthly-coverage lookup and the carnet validity window are evaluated against `attendance_records.attended_on`, not against today — the owner back-fills past sessions routinely.
- **Hard delete on refund.** Removing a presence deletes its entry, because a refunded entry is spendable again and must not appear in any balance. The attendance row itself is only *soft*-deleted, so the tombstone remains the audit trail of what happened. Without this, the ordinary correct-a-mistake flow (soft-delete the wrong row, insert the right one) would cost two entries for one session.
- **Athlete erasure cascades.** Hard-deleting an athlete cascades through `attendance_records` and `carnets` and takes the entries with it, consistent with the GDPR Art. 17 flow.

## Related tables

- `carnets` — see [`carnet.md`](./carnet.md)
- `attendance_records` — see [`attendance-record.md`](./attendance-record.md)
