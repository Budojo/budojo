# Entity — `PostRsvp`

## Purpose

A `PostRsvp` is one RSVP response on an `event`-type `CommunityPost` (#600, M9 community layer, PR-E). Only meaningful when the parent post has `type = 'event'`.

V1 tracks two explicit positive responses (`going` / `maybe`); declined is implicit (absence of a row = "no answer"). The reasoning lives in [`docs/api/v1.yaml`](../api/v1.yaml) under `RsvpResponse`.

## Schema — `post_rsvps`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `post_id` | bigint unsigned | not null, FK → `community_posts.id` ON DELETE CASCADE | Parent event post. |
| `user_id` | bigint unsigned | not null, FK → `users.id` ON DELETE CASCADE | Responder. |
| `response` | string(16) | not null | `App\Enums\RsvpResponse` value — V1: `going` / `maybe`. |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | Bumped when the user flips between `going` ↔ `maybe`. |

### Indices

- `UNIQUE (post_id, user_id)` — one RSVP per `(user, event-post)` pair. Toggle between `going` ↔ `maybe` updates `response` + `updated_at` in place.

## Tenant isolation

Same pattern as `post_reactions` / `post_comments` — no `academy_id`, every read/write joins back to the parent.

## Relations

- `belongsTo(CommunityPost::class, 'post_id')` — parent event post.
- `belongsTo(User::class)` — responder.

## Business rules

- **Only valid on `type = 'event'` posts** — the API rejects RSVPs on `belt_promotion` / `owner_announcement` posts with 422. Enforced in the FormRequest layer.
- **One RSVP per `(user, post)` pair** — UNIQUE constraint; the toggle flow is a `updateOrCreate`.
- **No explicit Declined value (V1)** — absence of a row means "no answer". A future V2 could add `declined` if the product justifies the cardinality.
- **Cross-academy returns 404** — uniform privacy gate.
