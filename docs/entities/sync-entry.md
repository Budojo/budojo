# Entity — `sync_entries` (what this database has dealt with)

## Purpose

One row per journal entry this database has dealt with, for the sync between the owner's devices (#2031, [`docs/sync/protocol.md`](../sync/protocol.md) § A journal entry):
- the device's own writes, as the journal middleware records them;
- every entry a rebase applies, finds already true, or turns into a conflict.

Each row is written **in the same transaction as the write or the outcome it stands for**. It travels with the database: it is what makes a replay idempotent, and what `GET /api/v1/sync/holds` reads.

There is no Eloquent model: the rows are written and read by the sync's Actions with the query builder.

## Schema — `sync_entries`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | string(26) | PK | The entry's ULID. A device's ids only grow (`JournalIds`): above every id that device has recorded, even when its clock steps back. |
| `device` | string(16) | not null | The device that made the write, as named in the sync folder (`pc4f2a`, `phone9c1e`). |
| `outcome` | string(12) | not null | `own` (this device's write); and, from the rebase (#2031 step 3), `applied`, `already` or `conflict`. |
| `created` | text (JSON) | not null | The ids the entry created **in this database**, by table: `{"athletes": [57], "athlete_promotions": [12]}`. A replay that skips the entry still takes these into its id map. |
| `recorded_at` | timestamp | default now | When this database dealt with it. |

## Indexes

- `PRIMARY KEY(id)`
- `(device, id)`: the newest entry per device, for `holds` and for the next id.

## Business rules

- **Never cleared with the journal.** Clearing `sync_journal` forgets what the device still has to carry, not what the database has dealt with.
- **`holds`** is, per device, `max(id)`. Ids only grow per device, so holding the newest means holding every one before it.
