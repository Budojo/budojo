# Entity — `PostReaction`

## Purpose

A `PostReaction` is one emoji-react on a `CommunityPost` (#600, M9 community layer). V1 supports two emojis — `clap` and `pray` — see `App\Enums\ReactionEmoji`.

Append-only at the row level (no soft-delete column): toggling to a different emoji replaces the row in a single transaction; removing a reaction deletes the row.

## Schema — `post_reactions`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `post_id` | bigint unsigned | not null, FK → `community_posts.id` ON DELETE CASCADE | Parent post. Cascade on hard-delete; soft-deleted posts keep their reactions. |
| `user_id` | bigint unsigned | not null, FK → `users.id` ON DELETE CASCADE | Reacting user. Cascade on user hard-delete. |
| `emoji` | string(16) | not null | `App\Enums\ReactionEmoji` value — V1: `clap` / `pray`. |
| `created_at` | timestamp | not null, default current | Append-only; no `updated_at`. |

### Indices

- `UNIQUE (post_id, user_id)` — one reaction per `(user, post)` pair. The Action layer handles the emoji-swap atomically in a transaction. Also serves as the lookup index for `post_id`-only queries (leftmost-prefix).

## Tenant isolation

**No `academy_id` column on purpose.** Every read query joins back to `community_posts.academy_id`; every write endpoint authorises via a FormRequest gate that re-checks the post belongs to the authenticated user's academy. Denormalising `academy_id` would create a consistency mismatch surface — we accept the join cost to keep the invariant single-sourced on the parent.

## Relations

- `belongsTo(CommunityPost::class, 'post_id')` — parent post.
- `belongsTo(User::class)` — reacting user.

## Business rules

- **One reaction per `(user, post)` pair** — UNIQUE constraint enforces it. The toggle-to-different-emoji flow is a single transaction: DELETE old row + INSERT new row OR `updateOrCreate` (whichever the Action picks).
- **Append-only at the row level** — no `updated_at`, no soft-delete. A user "removes" their reaction by deleting the row.
- **Cross-academy reads / writes return 404** — uniform privacy gate inherited from the parent post.
