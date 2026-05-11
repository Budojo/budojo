## What

M9 PR-A — the schema slice. Lays the foundation for the community layer (#600 umbrella) without any HTTP, UI, or observer logic. PR-B (#602) will activate the schema with the first auto-post path.

### Added files

**Migrations (4)** — `server/database/migrations/2026_05_11_180000_*`:

- `create_community_posts_table` — parent table. `academy_id` FK + cascade, `type` (enum string), `visibility` (default `'academy'`, `'public'` reserved for V2), `payload` (`json`), `created_by_user_id` FK + cascade, soft-deletes. Index `(academy_id, deleted_at, created_at)` covering the feed query.
- `create_post_reactions_table` — FK `post_id` cascade, FK `user_id` cascade, `emoji` (16-char string), `created_at` only (no soft-delete; append/remove). UNIQUE `(post_id, user_id)`.
- `create_post_comments_table` — FK `post_id` cascade, FK `user_id` cascade, `body` (text — 500-char limit enforced at FormRequest layer for SQLite portability), timestamps + soft-deletes. Index `(post_id, deleted_at, created_at)` for the thread query.
- `create_post_rsvps_table` — FK `post_id` cascade, FK `user_id` cascade, `response` (16-char string), timestamps. UNIQUE `(post_id, user_id)`. The "must point at an event-type post" check is the Action layer's job (PR-E); FK is generic at the DB level.

**Enums (4)** — `server/app/Enums/`:

- `CommunityPostType` — `belt_promotion` | `event` | `owner_announcement`
- `CommunityPostVisibility` — `academy` | `public` (the latter reserved for V2 cross-academy)
- `ReactionEmoji` — `clap` | `pray`
- `RsvpResponse` — `going` | `maybe` (no explicit `declined` — see enum docblock)

**Models (4)** — `server/app/Models/`:

- `CommunityPost` — relations: `academy`, `createdBy` (User), `reactions`, `comments`, `rsvps`. Casts: `type` + `visibility` to enums, `payload` to `array`. Uses `SoftDeletes`.
- `PostReaction` — relations: `post`, `user`. Cast: `emoji` to enum. `UPDATED_AT = null` (append/remove only).
- `PostComment` — relations: `post`, `user`. Uses `SoftDeletes`.
- `PostRsvp` — relations: `post`, `user`. Cast: `response` to enum.

**Factories (4)** — `server/database/factories/`:

- `CommunityPostFactory` — default `OwnerAnnouncement` type; helpers `beltPromotion($athleteId, $oldBelt, $newBelt)` and `event($title, $startsAt)` for typed payloads (PR-B + PR-E will use them).
- `PostReactionFactory` — default `Clap`; `pray()` helper.
- `PostCommentFactory` — short fake sentence body, well under 500-char cap.
- `PostRsvpFactory` — defaults the parent post to an `event` (so the PR-E Action's type-check passes when tests build RSVPs via the factory); `maybe()` helper.

**PEST test (1)** — `server/tests/Feature/Community/CommunitySchemaTest.php`:

15 tests / 46 assertions pinning the migration invariants:

- Factory shape for each model + each `CommunityPost` type variant.
- FK cascade: hard-deleting an `Academy` or a `User` removes their `community_posts`.
- FK cascade: hard-deleting a `CommunityPost` removes its `post_reactions`.
- Soft-delete: a post (or comment) is hidden by default and recoverable via `withTrashed()`.
- UNIQUE `(post_id, user_id)` enforced on both `post_reactions` and `post_rsvps` (second insert throws `QueryException`).
- Enum cast on read for `type`, `visibility`, `emoji`, `response` (reloads from DB then asserts the enum instance, not the string).
- Eager-loading covers all 5 relations on `CommunityPost`.

## Why

PRD lockstep: see `docs/specs/m9-community.md` (merged via #599) — V2-forward schema decisions (`visibility` enum, nullable `location_lat/lon` in the event payload, generic `payload jsonb`) are baked into the migrations from V1 so V2 cross-academy + map don't need destructive migrations.

PR-A intentionally ships BEFORE M7 (#445) lands, even though M9 PR-B through PR-F are gated on M7. Empty community tables don't affect any existing flow; reviewing the schema in isolation while the design is fresh in mind avoids drift between the PRD and the migrations.

## Out of scope

- **Observer for `Athlete::belt` change** → PR-B. The schema is here; the auto-post-creation logic is the next slice.
- **HTTP endpoints** → PR-B onwards. No controllers, no routes, no FormRequests in this PR.
- **SPA changes** → PR-B onwards. Zero client/ changes.
- **Push notification wiring** → PR-F (extends the M5 matrix).

## Test plan

- [x] `vendor/bin/php-cs-fixer fix` — clean (auto-applied `casts()` placement after relations method)
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — `[OK] No errors`
- [x] `vendor/bin/pest tests/Feature/Community/CommunitySchemaTest.php` — 15 tests, 46 assertions, all green (WARN status from the pre-existing dev-container `.env` lookup, not failures)
- [x] Migrations run forward + rollback cleanly on the SQLite in-memory PEST DB (every test runs `RefreshDatabase`, so this is implicit)
- [ ] CI green (phpstan + cs-fixer + pest --parallel + the Angular/OpenAPI/Worker jobs that don't touch this area)

## References

- Umbrella: #600 (M9 community layer)
- This sub-issue: #601 (M9 PR-A — schema + models + factories)
- PRD: `docs/specs/m9-community.md` (merged via #599)
- Sub-issues for follow-up slices: #602 (PR-B), #603 (PR-C), #604 (PR-D), #605 (PR-E), #606 (PR-F)

Closes #601.
