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
| `payment_method` | string(16) | nullable | How the sale was paid (#1761): `cash`, `transfer`, `pos` or `other` — the same [`PaymentMethod`](./athlete-payment.md#paymentmethod) a fee carries. **Null is "not recorded"**: every carnet sold before #1761 is null and stays null, and the field is optional |
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
- No separate index on `athlete_id`. The foreign key does not create one on SQLite (this line used to say it did, as `carnet-entry.md` did for `carnet_id` until #1722), and none is needed: both composite indexes above lead with it.

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
- **Its revenue lands whole in the month it was sold (#1553).** `GET /stats/payments/monthly` and the money summary book `price_cents` into the month of `purchased_at`, not across the validity window: it was spread until #1553, which made a €70 sale move the chart by €5.83. A fee still spreads over its period, so one chart runs two rules, deliberately — see [`athlete-payment.md`](./athlete-payment.md) § Stats aggregation. Attributing the money to the months entries are actually *consumed* was rejected: it rewrites past months every time a back-dated presence is marked, and never books an entry nobody used.

- **Price and size are snapshotted, not derived.** Both are copied from the academy config at sale. This is the same rule as `athlete_payments.amount_cents`.
- **Cannot sell without a configured offering.** If either `academies.carnet_price_cents` or `academies.carnet_entries` is `null`, `POST` returns `422` naming whichever field is missing. The owner sets them via `PATCH /api/v1/academy`.
- **The balance is never stored.** `remaining_entries` = `total_entries` − the number of `carnet_entries` rows. A stored counter would be a derived value pretending to be a fact, and every path that failed to update it would corrupt the balance undetectably.
- **Back-dating is allowed, post-dating is not.** Both `purchased_at` and `valid_from` default to today, may be set to any past date, and are rejected in the future. "Today" is the owner's (#1963, `App\Support\OperatorDay`), not UTC's: at 00:30 in Rome the 11th is today, not tomorrow. A carnet that "starts later" is not a concept: validity runs from a day that has happened.
- **Re-dating recomputes what the carnet paid for.** `PATCH` on the carnet moves `valid_from`, drags `expires_at` with it, and rebuilds the ledger — sessions can be claimed or released in either direction. See [`carnet-entry.md`](./carnet-entry.md).
- **Authorisation reuses the payments capability.** Selling a carnet is gated by `PaymentsMarkPaid` in the athlete's academy — it is the same act of trust as marking a month paid, and the capability matrix is deliberately coarse-grained. Listing is gated by `PaymentsRead`.
- **`valid_from` is the only editable field.** Code, price and size are snapshots of the sale; the expiry is derived. Nothing else can be changed after the fact.
- **A carnet can be deleted (#1380).** Originally ruled out — "a sold carnet is a fact" — but mistyping a sale is far likelier than wanting to rewrite history, and there was no way back. The sessions it paid for **stay on the attendance register** and become uncovered, unless another carnet's window can take them. How many lose cover is shown to the owner before the deletion, not after.

## Audit

`CarnetAuditObserver` logs all three mutations, labelled `"Mario Rossi — A7K2"`: `carnet.created` on sale, `carnet.updated` when the validity window moves — which changes what the athlete has already paid for — and `carnet.deleted` on `deleting`, so the row is still readable when the entry is written.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/carnets` — list the athlete's carnets, newest purchase first, each with `remaining_entries`
- `POST /api/v1/athletes/{athlete}/carnets` — sell one (body: optional `{purchased_at, valid_from, payment_method}`); returns 201
- `PATCH /api/v1/athletes/{athlete}/carnets/{carnet}` — move `valid_from` (and with it the expiry and the ledger)
- `DELETE /api/v1/athletes/{athlete}/carnets/{carnet}` — undo a mis-sale; 204

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `carnet_entries` — see [`carnet-entry.md`](./carnet-entry.md)
- `academies` — see [`academy.md`](./academy.md) (the `carnet_price_cents` / `carnet_entries` offering, and `carnet_entry_unit` — whether an entry pays for a lesson or a whole day, #1576)
- `athlete_payments` — see [`athlete-payment.md`](./athlete-payment.md) (the monthly fee, which takes priority over carnet consumption)
