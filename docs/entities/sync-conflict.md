# Entity — `sync_conflicts` (writes a rebase could not carry)

## Purpose

One row per journal entry a rebase could not carry onto the other device's database (#2031, [`docs/sync/protocol.md`](../sync/protocol.md) § Rebase). **Never dropped:** each waits for the owner with both sides, the write as it was replayed and what the database holds instead (PRD § 6.4). The owner's answer is #2038.

Written by `ReplayJournalAction` **in the same transaction** as the entry's `sync_entries` row (outcome `conflict`) and its kept journal entry. It travels with the database, as `sync_entries` does, so a conflict the owner answered is never raised again.

No Eloquent model, as for `sync_entries`.

## Schema — `sync_conflicts`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `entry_id` | string(26) | PK | The journal entry that could not be carried: one conflict each. |
| `device` | string(16) | not null | The device that made the write. |
| `route` | string(120) | not null | The entry's route name. |
| `reason` | string(16) | not null | Why, below. |
| `detail` | text (JSON) | not null | What the replay found: the field and both values (`{"field": "first_name", "saw": "Luca", "here": "Luke"}`), or the status, message and validation errors. |
| `entry` | text (JSON) | not null | The write as replayed here, in this database's ids: `method`, `params`, `body`, `before`. |
| `recorded_at` | timestamp | default now | When the replay found it. |
| `decided_at` | timestamp | nullable | When the owner answered (#2038). |
| `decision` | string(16) | nullable | `theirs`, `mine` or `by-hand`, once answered (#2038). |

## Indexes

- `PRIMARY KEY(entry_id)`

## Enum — `reason`

| Value | When |
|---|---|
| `refused` | The rules refuse it here: 403, 409, 422. |
| `gone` | Its row is gone: 404, or an update whose target was deleted here, softly too. Or it names a row an earlier entry made there and none here (`detail.lost`). |
| `changed` | A field it changes was changed here since it was written, or a delete by year and month meets another row than the one it deleted. |
| `differs` | The row it made or found here differs in a field the entry sets: the same month's payment made otherwise, or an amount the fee here works out otherwise. |
| `failed` | Anything else, a server error first. |
| `unknown-route` | A route this Budojo no longer has. |

## The owner's answer (#2031, #2038)

`GET /api/v1/sync/conflicts` lists those that wait (`decided_at` null), and `POST /api/v1/sync/conflicts/{entry}/decision` records the answer:
- **`theirs`:** what is here stays;
- **`mine`:** the page sent the conflict's `retry` first, the requests that make the set-aside write true here. A month paid otherwise is undone first. There is no `retry` for:
  - a write whose row is gone here;
  - an upload;
  - a payment whose amount the fee here works out otherwise;
  - a route this Budojo no longer has;
- **`by-hand`:** the owner set it right themselves.

**The answer is journaled** (`sync.conflicts.decide`): it reaches the other device's database even through a rebase that starts from a version that still asks. Recording it again, or for a conflict this database does not hold, changes nothing.

## Business rules

- **What the write did is undone before the conflict is recorded:** every replayed write runs in a savepoint, rolled back when it does not apply.
- **A replay never stops on an entry.** The shell replays before the app serves, so a replay that threw would stop every start: a failure is a `failed` conflict.
- **The entry is still kept** in the device's journal, so the next version carries it, and the other device then holds it (`sync_entries`) and never raises it again.
