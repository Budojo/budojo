# Entity — `AcademyFeeTier`

## Purpose

One line of an academy's monthly price list (#1381) — a label, an amount, and how many lessons a week it buys.

An academy used to have exactly one fee, `academies.monthly_fee_cents`. An academy that charges by how often someone trains — 2 lessons a week €55, 3 lessons €65 — had no way to express that, and the alpha tester was reduced to **selling carnets as a stand-in** just to tell the two groups apart. That workaround breaks by itself: a carnet spends an entry per attended day, so someone who misses a week doesn't lose it the way a subscription does, and the two models diverge.

`academies.monthly_fee_cents` survives as the **default for athletes on no tier**, which is every athlete until someone is moved. Nothing about an existing academy changes by this table existing.

## Schema — `academy_fee_tiers`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `academy_id` | bigint unsigned | FK `academies.id`, cascade on delete | Owning academy. Tenant scoping, as everywhere else |
| `label` | varchar(60) | not null, UNIQUE with `academy_id` | What the owner calls it — "2 lezioni", "Ragazzi". Free text, because an academy's own vocabulary is the useful label. Two tiers with the same name at different prices is a mistake, not a use case |
| `amount_cents` | unsigned int | not null | Monthly fee for this tier, **in cents** (€55.00 = `5500`). Zero is allowed — an academy may well list a free tier |
| `lessons_per_week` | unsigned tinyint | not null, 1–14 | How often this tier trains. Structured, **not buried in the label**: "the athlete on the 2-lesson tier trained four times this week" is exactly what an attendance register exists to notice, and a free-text string cannot be asked. The 14 ceiling catches a fat finger; it does not model a rule |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

The athlete side is one nullable column on `athletes`:

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `fee_tier_id` | bigint unsigned | nullable, FK `academy_fee_tiers.id`, **null on delete** | Which line of the price list this athlete is on. `null` means "the academy's own `monthly_fee_cents`", which is what every athlete is on today — so this shipped without a backfill and without moving a single existing payment |

## Relations

- `belongsTo(Academy::class)`
- `hasMany(Athlete::class, 'fee_tier_id')` — the people on this tier. Loaded as `withCount('athletes')` on the list endpoint, because how many are on it is what makes deleting a tier a decision rather than a guess

## Indexes

- `UNIQUE(academy_id, label)` — one label per academy

## Business rules

- **The tier resolves the fee; the academy is the fallback.** `App\Support\MonthlyFee::forAthlete()` is the single expression of the rule: an athlete on a tier pays that tier's `amount_cents`, an athlete on none pays `academies.monthly_fee_cents`. `null` from both means no fee applies and `POST /athletes/{id}/payments` returns 422 — the same refusal as before, for the same reason.
- **Deleting a tier never deletes the people on it.** The FK is `nullOnDelete`, so they fall back to the academy fee. The confirmation says how many athletes that affects **before** the deletion, not after.
- **Re-pricing a tier does not rewrite history.** `athlete_payments.amount_cents` is snapshotted at the moment a payment is recorded (see [`athlete-payment.md`](./athlete-payment.md)), so what an athlete already handed over stays correct whatever happens to the tier afterwards. This is why no migration of past payments was needed.
- **A tier belongs to exactly one academy, and an athlete may only be put on one of their own academy's.** `StoreAthleteRequest` / `UpdateAthleteRequest` scope the `exists` rule to the athlete's academy — attaching another academy's tier would make the fee resolve to a price the owner cannot even see.
- **Writing the price list is `academy_settings_update`.** It is academy configuration, gated by the same capability as changing the flat fee it generalises: front-desk staff who may record a payment have no business setting what the payment is. Reading it is `academy_settings_read`, which every role holds.
- **Tiers are defined by lesson count.** An academy that thinks in age brackets or per-course pricing does not fit this shape, and will need a revisit.

## Related endpoints

- `GET /api/v1/academy/fee-tiers` — the price list, ordered by `lessons_per_week` then `id`, each row carrying `athletes_count`
- `POST /api/v1/academy/fee-tiers` — add a tier
- `PATCH /api/v1/academy/fee-tiers/{tier}` — re-price or rename (partial)
- `DELETE /api/v1/academy/fee-tiers/{tier}` — remove a tier; athletes on it fall back to the academy fee
- `PUT /api/v1/athletes/{athlete}` — `fee_tier_id` puts an athlete on a tier, `null` takes them off

## Not yet done

The **per-athlete override** — a flat amount on the athlete that wins over the tier, for the black belt who trains free — is the second half of #1381 and is not built. The schema was shaped knowing it is coming: it lands as one more branch inside `MonthlyFee::forAthlete()` rather than as a second rule somewhere else.

## Related tables

- `academies` — see [`academy.md`](./academy.md)
- `athletes` — see [`athlete.md`](./athlete.md)
- `athlete_payments` — see [`athlete-payment.md`](./athlete-payment.md)
