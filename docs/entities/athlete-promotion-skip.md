# Athlete promotion skip

## Purpose

A step the owner said an athlete never took (#1966). The Promozioni tab draws the steps missing from an athlete's promotion history as ghost rows (see [`athlete-promotion.md`](./athlete-promotion.md) § The missing steps). Some were never missing: in BJJ a white belt can be promoted to blue from three stripes. "Saltato" on the ghost row writes one of these rows, and the step stops being reported. Without it, the same gap would come back on every visit.

## Schema — `athlete_promotion_skips`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint | no | PK |
| `athlete_id` | bigint | no | FK → `athletes.id`, **cascade** on delete |
| `belt` | string(32) | no | The belt the skipped step would have led to — a `Belt` enum value |
| `stripes` | unsigned tinyint | no | The count on that belt after the step: `0` for a belt step (or the count a poom carries into its dan), the new count for a stripe step |
| `created_at`, `updated_at` | timestamp | no | |

## Indexes

- `UNIQUE (athlete_id, belt, stripes)` — one skip per step, and what makes the endpoint idempotent.

## Relations

- `belongsTo Athlete`; `Athlete::promotionSkips()` is the inverse.

## Business rules

- **Keyed by the grade, not by a row.** A gap is identified by the state its step leads to (`key` = `<kind>:<belt>:<stripes>`), and so is a skip. It outlives any promotion row being added or deleted around it.
- **Judged against the academy's ladder**, like every belt that comes in: `BeltInLadder` on `belt`, `StripesWithinGrade` on `stripes`. A skip for a grade the art does not award would hide nothing.
- **Idempotent both ways.** A second skip returns 201 without a second row; deleting a skip that is not there returns 204. What matters is the state the owner ends in, not how many times they tapped.
- **Owner-side only**, gated by `athletes_create_update` in the athlete's academy — the same capability as writing promotion history.
- **Not personal data beyond the athlete it belongs to.** It cascades with the athlete, and so with an academy purge.
- **Listed, so it can be taken back (#1989).** `GET /athletes/{athlete}/promotions` returns `skipped` beside `gaps`: every step a skip hides, oldest first, as `{key, kind, belt, stripes}`. The Promozioni tab shows them under the timeline as one folded line («N passaggi segnati come saltati · Mostra»), each with «Ripristina», which deletes the skip. Before that, the only undo was the line left in place during the visit that skipped the step. A skip for a step the history no longer misses (it was recorded since, or falls outside every walk) hides nothing and is not listed.

## Related endpoints

- `POST /api/v1/athletes/{athlete}/promotion-skips` — body `{ "belt": "white", "stripes": 4 }` → 201.
- `DELETE /api/v1/athletes/{athlete}/promotion-skips/{belt}/{stripes}` → 204 (the undo).
