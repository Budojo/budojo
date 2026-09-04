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
| `purchased_at` | date | not null | Business date of the sale. Back-dateable (the owner transcribes a paper register); never post-dated |
| `expires_at` | date | not null | `purchased_at` + 12 months, computed once at insert and stored |
| `created_at` | timestamp | nullable | Standard Eloquent timestamp |
| `updated_at` | timestamp | nullable | Standard Eloquent timestamp |

### Why `expires_at` is stored rather than derived

Two reasons. It keeps "which carnets are valid on date D" a plain indexed `WHERE` instead of a computed expression, and it means a future change to the validity period cannot retroactively expire carnets already sold — the same principle behind snapshotting price and size.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(code)` — the authority on code uniqueness. `SellCarnetAction` draws a random code and redraws when the index rejects it, so no application-side "is this taken?" query is needed
- `INDEX(athlete_id, expires_at)` — the "active carnets for this athlete on this date" lookup, which every read path performs
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

- **Price and size are snapshotted, not derived.** Both are copied from the academy config at sale. This is the same rule as `athlete_payments.amount_cents`.
- **Cannot sell without a configured offering.** If either `academies.carnet_price_cents` or `academies.carnet_entries` is `null`, `POST` returns `422` naming whichever field is missing. The owner sets them via `PATCH /api/v1/academy`.
- **The balance is never stored.** `remaining_entries` = `total_entries` − the number of `carnet_entries` rows. A stored counter would be a derived value pretending to be a fact, and every path that failed to update it would corrupt the balance undetectably.
- **Back-dating is allowed, post-dating is not.** `purchased_at` defaults to today and may be set to any past date; a future date is rejected at the request layer (`before_or_equal:today`). Validity runs from the purchase date, so a carnet that "starts later" is not a concept.
- **Authorisation reuses the payments capability.** Selling a carnet is gated by `PaymentsMarkPaid` in the athlete's academy — it is the same act of trust as marking a month paid, and the capability matrix is deliberately coarse-grained. Listing is gated by `PaymentsRead`.
- **No edit, no delete.** The API exposes neither. Correcting a mis-sale is out of scope (see [`docs/specs/entry-carnets.md`](../specs/entry-carnets.md) § Non-goals).

## Audit

`CarnetAuditObserver` writes a `carnet.created` audit entry on sale, labelled `"Mario Rossi — A7K2"`. Only `created` is wired, because the entity has no update or delete path.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/carnets` — list the athlete's carnets, newest purchase first, each with `remaining_entries`
- `POST /api/v1/athletes/{athlete}/carnets` — sell one (body: optional `{purchased_at}`); returns 201

## Related tables

- `athletes` — see [`athlete.md`](./athlete.md)
- `carnet_entries` — see [`carnet-entry.md`](./carnet-entry.md)
- `academies` — see [`academy.md`](./academy.md) (the `carnet_price_cents` / `carnet_entries` offering)
- `athlete_payments` — see [`athlete-payment.md`](./athlete-payment.md) (the monthly fee, which takes priority over carnet consumption)
