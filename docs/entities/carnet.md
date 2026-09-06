# Entity — `Carnet`

## Purpose

A pre-paid pack of training entries sold to an `Athlete` — the alternative to the fixed monthly fee for someone who trains occasionally. Default offering: 10 entries for €70, valid 12 months from purchase.

A carnet row is the **fact of a sale**. It is never edited and never deleted through the API; what changes over its life is the derived balance, which is computed by counting the [`CarnetEntry`](./carnet-entry.md) ledger rather than stored on the carnet.

## Schema — `carnets`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `code` | char(4) | not null, **UNIQUE** | Human-facing handle (`A7K2`) — the owner reads it off the athlete's card to find the right carnet, and it disambiguates between two carnets held at once. Generated server-side; never accepted from the client |
| `athlete_id` | bigint unsigned | FK `athletes.id`, cascade on delete | Owner of the carnet. Tenant scoping rides the athlete, as everywhere else |
| `total_entries` | unsigned tinyint | not null | Snapshot of `academies.carnet_entries` at sale. Resizing the offering later does NOT resize carnets already sold |
| `price_cents` | unsigned int | not null | Snapshot of `academies.carnet_price_cents` at sale. Raising the price later does NOT rewrite sold carnets |
| `purchased_at` | date | not null | Business date of the **sale** — when money changed hands. Back-dateable; never post-dated |
| `valid_from` | date | not null | When the carnet starts **covering sessions** (#1380). Defaults to the sale, editable afterwards, and may precede it: a carnet dated to cover March pays for training already on the register for March |
| `expires_at` | date | not null | `valid_from` + 12 months, recomputed whenever `valid_from` moves |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

### Why `expires_at` is stored rather than derived

It keeps "which carnets are valid on date D" a plain indexed `WHERE` instead of a computed expression, and a future change to the validity period cannot retroactively expire carnets already sold — the same principle behind snapshotting price and size.

### Why the window hangs off `valid_from`, not the sale

The two dates answer different questions, and conflating them is what made the owner's first real carnet wrong: sold on 4 September, it ignored the session recorded on the 2nd. What a carnet pays for has to be a property of its **window**, not of when someone clicked sell.

The expiry follows the validity start rather than the sale, so the window is always exactly twelve months. Pulling the start back therefore *spends* validity rather than adding it — a consequence the UI has to show before the owner confirms, not after.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(code)` — the authority on code uniqueness. `SellCarnetAction` draws a random code and redraws when the index rejects it, so no application-side "is this taken?" query is needed
- `INDEX(athlete_id, expires_at)` — the "active carnets for this athlete on this date" lookup, which every read path performs
- `INDEX(athlete_id, valid_from)` — the other end of the same window check, which moved off `purchased_at` in #1380
- Implicit index on `athlete_id` from the foreign key

## The code

Drawn from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — 31 symbols, deliberately excluding the glyph pairs that get misread when a code is read aloud or written by hand (`0`/`O`, `1`/`I`/`L`). Four characters give ~923k combinations.

Draws are **random, not sequential**: a counter would leak how many carnets an academy has ever sold and would make the next code guessable. Uniqueness is enforced by the database; `SellCarnetAction` retries a bounded number of times and then throws rather than looping — an exhausted keyspace is a bug worth surfacing.

Scope of uniqueness is the whole table, not per academy: a Budojo install is normally one academy, and table-wide uniqueness means a code is never ambiguous even in a multi-academy install.

## Relations

- `belongsTo(Athlete::class)` — exposed as `carnet->athlete`
- `hasMany(CarnetEntry::class)` — exposed as `carnet->entries`
- Inverse: `Athlete::carnets()` returns `HasMany<Carnet>`

## Business rules

- **Selling a carnet *is* the payment (#1383).** There is no paid / unpaid state on the row and no list of who owes for one: a pack is never handed over before it is collected. The card names `purchased_at` and `price_cents` together so the owner can see the money was taken; that is the whole of "how do I record a carnet payment".
- **Its revenue is spread across the validity window, not the sale month (#1383).** `GET /stats/payments/monthly` divides `price_cents` evenly over the months from `valid_from` up to (not including) the month of `expires_at` — €70 valid twelve months is about €5.83 a month, integer split with the remainder on the first. This is the same rule a twelve-month fee payment follows since #1382, so one chart runs one rule. Attributing the money to the months entries are actually *consumed* is the truer reading and was rejected: it rewrites past months every time a back-dated presence is marked, and never books an entry nobody used. See [`athlete-payment.md`](./athlete-payment.md) § Stats aggregation.

- **Price and size are snapshotted, not derived.** Both are copied from the academy config at sale. This is the same rule as `athlete_payments.amount_cents`.
- **Cannot sell without a configured offering.** If either `academies.carnet_price_cents` or `academies.carnet_entries` is `null`, `POST` returns `422` naming whichever field is missing. The owner sets them via `PATCH /api/v1/academy`.
- **The balance is never stored.** `remaining_entries` = `total_entries` − the number of `carnet_entries` rows. A stored counter would be a derived value pretending to be a fact, and every path that failed to update it would corrupt the balance undetectably.
- **Back-dating is allowed, post-dating is not.** Both `purchased_at` and `valid_from` default to today, may be set to any past date, and are rejected in the future (`before_or_equal:today`). A carnet that "starts later" is not a concept: validity runs from a day that has happened.
- **Re-dating recomputes what the carnet paid for.** `PATCH` on the carnet moves `valid_from`, drags `expires_at` with it, and rebuilds the ledger — sessions can be claimed or released in either direction. See [`carnet-entry.md`](./carnet-entry.md).
- **Authorisation reuses the payments capability.** Selling a carnet is gated by `PaymentsMarkPaid` in the athlete's academy — it is the same act of trust as marking a month paid, and the capability matrix is deliberately coarse-grained. Listing is gated by `PaymentsRead`.
- **`valid_from` is the only editable field.** Code, price and size are snapshots of the sale; the expiry is derived. Nothing else can be changed after the fact.
- **A carnet can be deleted (#1380).** Originally ruled out — "a sold carnet is a fact" — but mistyping a sale is far likelier than wanting to rewrite history, and there was no way back. The sessions it paid for **stay on the attendance register** and become uncovered, unless another carnet's window can take them. How many lose cover is shown to the owner before the deletion, not after.

## Audit

`CarnetAuditObserver` logs all three mutations, labelled `"Mario Rossi — A7K2"`: `carnet.created` on sale, `carnet.updated` when the validity window moves — which changes what the athlete has already paid for — and `carnet.deleted` on `deleting`, so the row is still readable when the entry is written.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/carnets` — list the athlete's carnets, newest purchase first, each with `remaining_entries`
- `POST /api/v1/athletes/{athlete}/carnets` — sell one (body: optional `{purchased_at, valid_from}`); returns 201
- `PATCH /api/v1/athletes/{athlete}/carnets/{carnet}` — move `valid_from` (and with it the expiry and the ledger)
- `DELETE /api/v1/athletes/{athlete}/carnets/{carnet}` — undo a mis-sale; 204

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `carnet_entries` — see [`carnet-entry.md`](./carnet-entry.md)
- `academies` — see [`academy.md`](./academy.md) (the `carnet_price_cents` / `carnet_entries` offering)
- `athlete_payments` — see [`athlete-payment.md`](./athlete-payment.md) (the monthly fee, which takes priority over carnet consumption)
