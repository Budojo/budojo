# Entity — `PostComment`

## Purpose

A `PostComment` is one comment on a `CommunityPost` (#600, M9 community layer). V1 ships a flat list per post (no threading — the parent is the only level above). Sorted oldest-first on the read side.

## Schema — `post_comments`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | Internal identifier |
| `post_id` | bigint unsigned | not null, FK → `community_posts.id` ON DELETE CASCADE | Parent post. Cascade on hard-delete. |
| `user_id` | bigint unsigned | not null, FK → `users.id` ON DELETE CASCADE | Comment author. |
| `body` | text | not null | Free-form text content. Server enforces a max length via FormRequest. |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |
| `deleted_at` | timestamp | nullable | Owner-only soft-delete for moderation. |

### Indices

- `INDEX (post_id, created_at)` — feed-side comment hydrate path: load all comments for a post in chronological order.

## Tenant isolation

Same pattern as `post_reactions` — no `academy_id`, every read/write joins back to the parent post's `community_posts.academy_id` for the tenant gate.

## Relations

- `belongsTo(CommunityPost::class, 'post_id')` — parent post.
- `belongsTo(User::class)` — author.

## Business rules

- **Flat structure (V1)** — no `parent_comment_id`. Threading lands in V2 if community engagement justifies the UI complexity.
- **Owner-only soft-delete** — athletes can delete their own comments? V1 ships owner-side moderation only; athlete self-delete is a follow-up.
- **Cross-academy reads / writes return 404** — uniform privacy gate.
