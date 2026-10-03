# Entity — `sync_journal` (this device's kept writes)

## Purpose

This device's own writes, kept in full until every other device holds them (#2031, [`docs/sync/protocol.md`](../sync/protocol.md) § A journal entry and § Deciding). A rebase replays them through the router onto another device's database; the app packs the ones a version lacks into its journal.

Recorded by the `RecordJournalEntry` middleware, **on a paired device only** (`budojo.sync.device`, from the shell's `BUDOJO_DEVICE_ID`; never the database, which travels), for the academy's data writes (`JournalRoutes`): `academy.*`, `athletes.*`, `attendance.*`, `documents.*`, `lessons.*`, `me.athlete.*`, `me.attendance.*`. The account, the session, the sync itself and invitations are never journaled.

No Eloquent model, as for `sync_entries`.

## Schema — `sync_journal`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | string(26) | PK | The entry's ULID, the same id as its `sync_entries` row. |
| `device` | string(16) | not null | Always this device once the reconcile has run (see below). |
| `at` | string(32) | not null | UTC with microseconds, `2026-10-01T18:32:05.123456Z`. |
| `method` | string(6) | not null | `POST`, `PUT`, `PATCH` or `DELETE`. |
| `route` | string(120) | not null | The route name, pinned by `WriteRouteNamesTest`. |
| `params` | text (JSON) | not null | The route parameters as the URL gave them, numbers as numbers: `{"athlete": 57}`. |
| `body` | text (JSON) | nullable | The request body, with what the write worked out for itself where money rides on it: a payment's `amount_cents`, `period_months`, `paid_at` and `payment_method`, `null` included (`ResolvedFields`). An uploaded file is `{"$file": {"sha256": …, "name": "p.png", "type": "image/png"}}`, its bytes kept on the private disk, encrypted (see below). |
| `created` | text (JSON) | not null | The ids the write created, by table, the rows of the Actions behind it included (an athlete's first belt is a promotion a later entry can name). |
| `before` | text (JSON) | nullable | For a change or a delete, what the rows held before, by table and id: `{"athletes": {"57": {"first_name": "Luca"}}}`. A change records the fields it changed; a delete, the whole row as stored. A set replaced through a pivot is recorded as the request names it, sorted: `{"lessons": {"12": {"topic_ids": [3, 7]}}}` (`SetReplaced`, #2102). |

## Indexes

- `PRIMARY KEY(id)`
- `(device, id)`

## Business rules

- **The write and its entry share one transaction.** Only a successful write is recorded; the transaction commits either way, so a failed write behaves as it always has.
- **Cleared only up to what every other device holds** (`DELETE /api/v1/sync/journal?through=`). The kept uploads no remaining entry names go with them.
- **A rebase keeps them again** (`ReplayJournalAction`, protocol § Rebase): every entry the replay applies, finds already true or turns into a conflict, in the swapped-in database's ids, with its original id. One the database had dealt with already is not kept: the version carries it.
- **A database keeps only its own device's journal.** After a swap, `budojo:sync-reconcile` drops the rows of other devices (`KeepOwnJournalAction`): they are that device's to clear. An unpaired device keeps none.
- **Writes made with the query builder are not seen** in `created` and `before`: the replay runs the same Actions and makes them again. The conflict check is about a write's **target** (the athlete edited, the payment undone), which every journaled Action writes through its model; the query-builder writes are what follows from it and the replay derives again (a programme topic's children, a lesson's topics, attendance adopted by a lesson, training days read off the timetable, carnet entries, an address). The payment undo used to delete with a query; it deletes each row through its model, which also gives the activity log its `payment.deleted`.
- **A kept upload is encrypted at rest** (`JournalUploads`), under the document key like a medical certificate, as `sync/journal/<sha256>.enc`. It is written only once the write has succeeded and its entry is recorded, and swept when no kept entry names it: by `DELETE /api/v1/sync/journal` and by the reconcile, **after a rebase's replay** has kept its entries again.
