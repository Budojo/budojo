# Entity — `AthletePromotion`

## Purpose

Append-only audit log of every belt + stripe promotion an athlete has received. Shipped in v2.10.0 (#654) after a direct user ask: "vorrei che per ogni atleta ci si ricordasse di questi passaggi (giorno per lo meno) nella sezione profilo... cosi io owner ricordo quando ho dato la striscia a chi".

Before this table, only **belt** changes left a trace (as a `belt_promotion` `CommunityPost` — feed-shaped, not a queryable history record). Stripe changes were silent. The new table gives the owner a date-level promotion ladder per athlete, surfaced on the **Promotions** tab of `/dashboard/athletes/{id}`.

## Why a separate table, not soft-events on `community_posts`

- `community_posts` is feed-shaped: paginated by recency, mixed with non-promotion content (events, free-text). A "list every promotion for athlete X chronologically" read against the feed would require a `WHERE type IN (belt_promotion, stripe_promotion) AND payload->athlete_id = X` scan — payload-JSON predicates aren't index-friendly.
- The feed post celebrates a moment; the history row is the persistent record. Different lifecycles — a feed post may be moderation-deleted, but the audit row must survive (kind of like an accountant's ledger).
- Stripe **drops** (4 → 0 when a belt goes up) deliberately don't celebrate on the feed (the belt-promotion post already covers it), but they DO write an `AthletePromotion` row so the per-belt ladder stays complete in the history.

## Schema — `athlete_promotions`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `athlete_id` | bigint unsigned | FK `athletes.id`, **indexed (composite)**, cascade on delete | Subject athlete. Cascade because a deleted athlete has no consumable history |
| `kind` | enum(`belt`, `stripe`) | not null | Discriminator. `belt` populates the belt columns; `stripe` populates the stripe columns. A third value lands the day a new milestone type appears (e.g. a federation rank); today's two cover the BJJ surface fully |
| `from_belt` | string(16) | nullable | Belt enum value (string, not FK — dropping a belt option doesn't orphan history). Null on the athlete's first belt assignment (no prior belt to record). Populated on `kind = belt` rows |
| `to_belt` | string(16) | nullable | Belt enum value. Populated on `kind = belt` rows |
| `from_stripes` | tinyint unsigned | nullable | Stripe count before the event. Populated on `kind = stripe` rows. Range 0–10 globally (Athlete::stripes column), per-grade cap from the academy's ladder (#1800) |
| `to_stripes` | tinyint unsigned | nullable | Stripe count after the event. Same range as `from_stripes` |
| `belt_at_event` | string(16) | not null | Belt-snapshot at the moment of the event. On `belt` rows it equals `to_belt`; on `stripe` rows it gives the SPA visual context ("at what belt did this stripe happen") without joining back to the (possibly belt-changed-since) athlete |
| `recorded_at` | timestamp | not null, **indexed (composite)** | Wall-clock moment the promotion landed. Index supports the athlete-detail page's "latest first" read |
| `recorded_by_user_id` | bigint unsigned | FK `users.id`, restrict on delete | The owner-user who recorded the promotion via the athletes form. Restrict because we want to keep the audit log honest even if the owner-user is later deleted |
| `created_at` / `updated_at` | timestamp | nullable | Standard Eloquent timestamps |

## Relations

- `belongsTo(Athlete::class)` — exposed as `promotion->athlete`
- `belongsTo(User::class, 'recorded_by_user_id')` — exposed as `promotion->recordedBy`
- Inverse: `Athlete::promotions()` returns `HasMany<AthletePromotion>` ordered by `recorded_at DESC, id DESC` for stable pagination

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(athlete_id, recorded_at)` — hot path: athlete detail page reads "all promotions for this athlete, descending date"; single composite index covers both filter + sort. A second global "all promotions today" index isn't warranted today

## Business rules

- **`recorded_at` is editable; the transition it describes is not.** #1431 ("devo poter riscrivere la storia di un atleta") added `PATCH /api/v1/athletes/{athlete}/promotions/{promotion}` to fix the common case: a promotion entered after the fact carries the timestamp of when it was *typed*, not when it *happened*. Only `recorded_at` moves — `kind`, `from_belt`/`to_belt`, `from_stripes`/`to_stripes`, `belt_at_event`, and `recorded_by_user_id` describe the event itself and stay put. The write goes straight to the `AthletePromotion` row through a dedicated Action, never through `Athlete::$belt` / `Athlete::$stripes` — so it cannot trigger `AthleteObserver` and cannot drag the athlete's *current* belt or stripes around by editing history. `recorded_at` may not be set in the future.
- **Rows can be backfilled and deleted (#1431 PR 2 of 2).** `POST /api/v1/athletes/{athlete}/promotions` lets an owner transcribe a paper register — a promotion that happened before Budojo existed. Same non-negotiables as the edit path: the write never touches `Athlete::$belt` / `Athlete::$stripes`, so it cannot fire `AthleteObserver` and creates **no `CommunityPost`** — a bulk backfill of forty historical rows does not flood the feed with decade-old celebrations. `recorded_by_user_id` is always the caller doing the transcribing, never a guess at who recorded the real 2019 event. `DELETE /api/v1/athletes/{athlete}/promotions/{promotion}` is a hard delete for a row entered by mistake — no restore concept, since a promotion row has no downstream ledger to reconcile.
- **A backfill that contradicts its own-kind neighbours is refused, not silently allowed.** `ValidatesPromotionChainConsistency` checks a new row's `from_belt`/`from_stripes` against the nearest EARLIER same-kind row's `to_belt`/`to_stripes`, and `to_belt`/`to_stripes` against the nearest LATER same-kind row's `from_belt`/`from_stripes`; a mismatch is a 422 naming the row it disagrees with. A row with no same-kind neighbour on one side is unconstrained on that side — the legitimate "earliest/latest known event of this kind" case (most commonly: an athlete who joined already holding a belt or stripe count Budojo never generated a row for). **Deliberately scoped to same-kind neighbours only** — a stripe row is never cross-checked against belt rows even though a real belt promotion resets stripes to 0, because modelling that interaction would mean either auto-inserting an unrequested companion stripe-reset row on every belt backfill, or rejecting historically-accurate stripe entries whenever an unrelated belt row happens to sit between them.
- **Owner-side surface only.** Athletes don't see each other's promotion history; every endpoint under `/api/v1/athletes/{athlete}/promotions...` is owner-academy gated. The athlete portal carries no equivalent view in V1.
- **Observer-driven for LIVE changes; bypassed entirely for history writes.** `AthleteObserver::updated()` writes a row whenever `belt` or `stripes` changes via `wasChanged()` on the Athlete model itself. Console / seeder context skips entirely (no `Auth::id()` to attribute to), so `recorded_by_user_id` is non-nullable. Both the edit (PR 1) and create (PR 2) paths write directly to `AthletePromotion` and never touch the Athlete model, so neither can trigger this observer.
- **Stripes are 0–10 globally with a per-grade cap from the academy's ladder (#1800).** The global ceiling lives on `Athlete::stripes` (`max:10` on the FormRequests — taekwondo's black counts 1st–9th dan as 0–8); the grade's cap (6 on a BJJ black, 4 on a FIJLKAM black, 0 on a judo green) is enforced via the `ValidatesStripesAgainstBelt` trait for the athlete's own belt/stripes, and via a bespoke check in `StoreAthletePromotionRequest` against a backfilled row's own `belt_at_event` (a different field, same rule — not a shared trait, since each has exactly one caller). The promotion table mirrors the global ceiling — the per-grade cap is a request-time concern, not a stored-data concern.
- **A backfilled row's belts must be ones the academy's martial art awards (#1800).** `from_belt`, `to_belt` and `belt_at_event` go through `App\Rules\BeltInLadder`, judged against the athlete's academy's ladder: a transcribed register from a judo dojo cannot contain a purple belt. Rows written before the academy's art was set keep whatever they hold; the rule applies to writes.
- **Cascade with the athlete, restrict with the user.** Athlete-side cascade keeps storage clean when an athlete is hard-deleted; user-side restrict prevents a foot-gun where deleting an owner-user silently invalidates every history row they recorded.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/promotions` — paginated 20/page, owner-academy gated, ordered by `recorded_at DESC, id DESC`. Read-only.
- `PATCH /api/v1/athletes/{athlete}/promotions/{promotion}` — #1431 PR 1 of 2. Body: `{ "recorded_at": "YYYY-MM-DD" }`. 422 when missing, malformed, or in the future; 403 when the promotion doesn't belong to the athlete in the path (mirrors the carnet double-check) or the caller lacks `athletes_create_update` in the athlete's academy.
- `POST /api/v1/athletes/{athlete}/promotions` — #1431 PR 2 of 2. Body: `{ "kind": "belt"|"stripe", "recorded_at": "YYYY-MM-DD", ... }` — `from_belt`/`to_belt` for `kind=belt`, `from_stripes`/`to_stripes`/`belt_at_event` for `kind=stripe` (each set `prohibited_unless` its own kind). `belt_at_event` is NOT accepted for `kind=belt` — the controller derives it as `to_belt`. 422 on a shape violation, a no-op transition (`from == to`), a per-belt stripe-cap violation, a future date, or a chain-consistency conflict with a same-kind neighbour; 403 on the same academy/capability gate as the edit path.
- `DELETE /api/v1/athletes/{athlete}/promotions/{promotion}` — #1431 PR 2 of 2. Hard delete, 204 on success. Same 403 double-check as the edit path (promotion must belong to the athlete in the URL); 404 for an id that doesn't exist.
- `AthleteObserver` — internal: writes rows on `belt` / `stripes` change; also emits the `belt_promotion` or `stripe_promotion` feed post for the celebration UX. Never runs on a `recorded_at` edit or a backfilled create — both bypass the athlete model entirely.

## Future / TODO

- **Bulk record on athlete onboarding.** A new athlete imported with an existing belt won't have any history. A migration / Action could backfill a single `kind=belt, from_belt=null, to_belt={belt}` row on the import path so the timeline doesn't show "blank → today" gaps.
- **Per-athlete promotion analytics.** Aggregate read (average time-to-blue, days-per-stripe) would surface in a future "academy insights" view.
- **Athlete-side visibility.** A future opt-in toggle could let the athlete portal carry "my promotion history" — gated by an owner setting (PRD open question).
