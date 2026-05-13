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
| `from_stripes` | tinyint unsigned | nullable | Stripe count before the event. Populated on `kind = stripe` rows. Range 0–6 globally (Athlete::stripes column), per-belt sub-cap enforced via `ValidatesStripesAgainstBelt` (black 0–6, other belts 0–4) |
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

- **Append-only.** No update or delete API — once recorded, a row is the truth of what happened. A typo correction would require a follow-up row, not an edit.
- **Owner-side surface only.** Athletes don't see each other's promotion history; the endpoint (`GET /api/v1/athletes/{athlete}/promotions`) is owner-academy gated. The athlete portal carries no equivalent view in V1.
- **Observer-driven.** `AthleteObserver::updated()` writes a row whenever `belt` or `stripes` changes via `wasChanged()`. Console / seeder context skips entirely (no `Auth::id()` to attribute to), so `recorded_by_user_id` is non-nullable.
- **Stripes are 0–6 globally with a per-belt sub-cap.** The global ceiling lives on `Athlete::stripes` (`max:6` on Store/Update FormRequest); the sub-cap (black 0–6, others 0–4) is enforced in the FormRequests via the `ValidatesStripesAgainstBelt` trait. The promotion table mirrors the global ceiling — the per-belt cap is a request-time concern, not a stored-data concern.
- **Cascade with the athlete, restrict with the user.** Athlete-side cascade keeps storage clean when an athlete is hard-deleted; user-side restrict prevents a foot-gun where deleting an owner-user silently invalidates every history row they recorded.

## Related endpoints

- `GET /api/v1/athletes/{athlete}/promotions` — paginated 20/page, owner-academy gated, ordered by `recorded_at DESC, id DESC`. Read-only.
- `AthleteObserver` — internal: writes rows on `belt` / `stripes` change; also emits the `belt_promotion` or `stripe_promotion` feed post for the celebration UX.

## Future / TODO

- **Bulk record on athlete onboarding.** A new athlete imported with an existing belt won't have any history. A migration / Action could backfill a single `kind=belt, from_belt=null, to_belt={belt}` row on the import path so the timeline doesn't show "blank → today" gaps.
- **Per-athlete promotion analytics.** Aggregate read (average time-to-blue, days-per-stripe) would surface in a future "academy insights" view.
- **Athlete-side visibility.** A future opt-in toggle could let the athlete portal carry "my promotion history" — gated by an owner setting (PRD open question).
