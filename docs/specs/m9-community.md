# M9 — Community (grading feed + events)

A community layer for logged-in **adult** athletes inside their academy. Grading promotions auto-celebrated; owners create event posts (open mats, gradings, in-house comps, seminars); athletes react with emoji and comment with a Reddit-style identity flair (handle + first/last name + belt).

Single-academy scope in V1. Cross-academy discovery + map view are V2, but the V1 schema is shaped so V2 doesn't need a migration.

---

## Problem statement

After M7 lands the athlete-side login, an athlete who logs in sees a placeholder welcome page and… nothing else. Budojo is operations-only for the owner today — no surface gives athletes a reason to open the app between classes.

In BJJ / judo / sambo / similar grappling cultures, the community is half the product:

- **Grading promotions** are emotional milestones celebrated in the room — but nothing structures the moment beyond a verbal congrats. Most academies put a post on Instagram or in the WhatsApp group later. The information exists but is unmoored from the athlete's training record.
- **Open mats, in-house comps, seminars** are organised today via WhatsApp groups (unstructured, easy to lose, no RSVP visibility, dependent on the owner remembering to share). The owner is the bottleneck; if they don't post in WhatsApp, the event doesn't exist for the athletes.
- **Athletes never see each other's progress.** A new white-belt training next to a brown-belt has no idea what milestones the brown-belt has hit; identification is tribal-name-based at best.

Budojo already has the data (belts, attendance, owner, academy structure). What's missing is a **bounded** surface — *not* a generic social network — where these moments become first-class.

Adults-only by design: minors are blocked at athlete-portal registration (birthdate gate). That removes the worst legal exposure (consent, content-of-minors handling, DPIA expansion) and lets V1 ship without a separate compliance pass.

## Goals

- Give logged-in adult athletes a reason to open the portal between classes.
- Make a grading promotion a visible, celebratable, system-recorded moment without manual owner work.
- Let owners advertise events to their athletes in 30 seconds (today: WhatsApp + retyping + losing track of who confirmed).
- Establish an identity surface (handle + name + belt) that is reusable in V2 cross-academy without rework.

## Non-goals (V1)

- Photo or video uploads (V2 maybe; needs separate DPIA even adults-only).
- Cross-academy discovery, map view, "follow another academy" (V2).
- Threaded / nested replies in comments (1 level only).
- Direct messages between athletes (out of scope, possibly forever).
- A generic-purpose feed where anyone posts anything (only system-generated grading celebrations + owner-created event posts).
- Minor athletes (under 18) on the portal at all.

## Hard rules (non-negotiable in V1)

1. **Adults only.** Athlete-portal registration rejects birthdates that make the athlete < 18 on the date of acceptance. The owner can still manage minors via the dashboard; minors just don't get a portal account.
2. **Single-academy scope.** Every community-layer query is `WHERE academy_id = ?`. No cross-academy data leaks possible in V1.
3. **Owner is sole moderator.** Owner can soft-delete any post or comment in their academy. No flag-and-review queue, no auto-moderation, no third-party content scanning.
4. **No DMs.** All conversation surface is post-anchored (a comment under a community post). No private channels.
5. **Identity card is system-rendered.** Handle + first/last name + belt come from `users` + `athletes` joins. The athlete cannot pick a separate "social name" or hide their belt.
6. **Text + emoji react only.** No image uploads, no links to external image hosts (URL stripping not enforced V1 but no embedding either — links render as plain text).
7. **Comment body length capped at 500 chars.** Hard limit at validation; encourages short, on-topic responses.

## User stories

### Athletes

- As a logged-in adult athlete, when I open `/portal/feed`, I see a chronological timeline of recent posts in my academy (grading celebrations + events the owner created).
- As an athlete, I can react to a post with one of `clap` (👏) or `pray` (🙌) — one reaction per athlete per post; tapping the same emoji again removes it.
- As an athlete, I can post a 1-level comment under any post (≤ 500 chars). My comment shows my handle + first/last name + belt flair.
- As an athlete, I receive a push notification (subject to my M5 preferences) when (a) someone replies under a comment thread I started, OR (b) the owner creates a new event in my academy.
- As an athlete, when I RSVP to an event post (`going` / `maybe`), the RSVP count on the post updates and other athletes see I'm going.

### Owners

- As an owner, when I promote an athlete to a new belt via `PATCH /api/v1/athletes/:id`, the system auto-creates a `belt_promotion` post in the feed. No extra clicks.
- As an owner, I can create an event post (title, description, datetime, location text, optional max attendees) from `/dashboard/community` and it appears in the athlete portal feed immediately.
- As an owner, I can soft-delete any post or any comment in my academy with one click (confirm popup, no recovery — explicit choice for moderation simplicity).
- As an owner, I see RSVP counts on every event post + a "view athletes" link that opens a list of who RSVP'd `going` or `maybe`.

## Hard dependencies

- **M7 (#445) — athlete-side login & self-service.** Without this, there are no logged-in athletes. M9 cannot start before M7 ships.
- **M5 notification preferences (already shipped, v2.5.0).** New categories `community_reply`, `community_event_new`, optional `community_belt_celebration` are added to the existing opt-out matrix.

## Tech decisions

### Schema (designed forward-compatible with V2)

```
community_posts
  - id (uuid pk)
  - academy_id (FK, INDEX)
  - type (enum: 'belt_promotion' | 'event' | 'owner_announcement')
  - visibility (enum: 'academy' | 'public', default 'academy')   -- 'public' is V2
  - payload (jsonb)                                              -- type-specific
  - created_by_user_id (FK)
  - created_at, updated_at, deleted_at
  - INDEX (academy_id, deleted_at, created_at DESC)             -- feed query

post_reactions
  - id (uuid pk)
  - post_id (FK, INDEX)
  - user_id (FK)
  - emoji (enum: 'clap' | 'pray')
  - created_at
  - UNIQUE (post_id, user_id)                                   -- one reaction per user per post

post_comments
  - id (uuid pk)
  - post_id (FK, INDEX)
  - user_id (FK)
  - body (varchar 500)
  - created_at, deleted_at
  - INDEX (post_id, deleted_at, created_at)

post_rsvps
  - id (uuid pk)
  - post_id (FK, INDEX)                                          -- must point at a row where posts.type='event'; enforced in Action
  - user_id (FK)
  - response (enum: 'going' | 'maybe')                          -- 'no_answer' = no row
  - UNIQUE (post_id, user_id)
```

**`payload` shapes per `type`:**

- `belt_promotion`: `{ athlete_id, old_belt, new_belt, promoted_at }`
- `event`: `{ title, description, starts_at, ends_at?, location_text, location_address?, location_lat?, location_lon?, max_attendees? }` — the lat/lon fields are nullable in V1 (we only capture address text), populated in V2 via geocoding.
- `owner_announcement`: `{ body }` — reserved type if we ever want owners to post a free-form message; not in V1 user-stories but kept in the enum for cheapness.

### Identity flair component (`<app-user-flair>`)

A single SPA component, rendered everywhere a user surfaces (post author, comment author, RSVP list). Inputs: a user-shaped object with handle/first_name/last_name/belt. Two visibility modes from day-one:

| Mode | What renders | When |
|---|---|---|
| `within_academy` | `Mario Rossi · @mariobjj · 🟦 Blue` | V1 default — anywhere in `/portal` |
| `public` | `@mariobjj · 🟦 Blue · Academy Roma` | V2 cross-academy contexts only |

V1 implements only `within_academy`. The component is parameterised from day one so V2 doesn't need a rewrite.

Edge cases:

- **No handle**: fall back to first-name + last-initial (`Mario R.`). Privacy-leaning, since handle is the canonical public identifier.
- **No belt**: render with a neutral chip "—" instead of a colored badge. (Atleti senza cintura assegnata sono rari ma possibili in onboarding.)
- **Instructor flag** (future): if the user has `role=instructor`, add a "🎓 Coach" badge after the belt. Schema-side, instructor is the same `users.role` enum extension envisioned in #428. Don't block on it; render coach badge only when role is set.

### Athlete portal feed page

- **Route**: `/portal/feed` — lives under the athlete-portal shell (M7 PR-D), NOT the owner dashboard.
- **Default landing**: athletes go straight here on portal login (vs the placeholder welcome page).
- **Paging**: 20 posts per page, server-paginated, infinite-scroll on mobile, button-paginated on desktop.
- **Ordering**: `created_at DESC`. Sticky "Today's events" banner if any event has `starts_at >= today AND starts_at < today + 24h`.
- **Empty state**: copy "No posts yet — when someone gets promoted or your academy schedules an open mat, you'll see it here. Until then, train hard 💪." Shown when V1 academy has 0 posts.

### Performance

- Feed query: `community_posts JOIN users JOIN athletes` for author flair on each post; `LEFT JOIN (SELECT post_id, count(*) FROM post_reactions GROUP BY post_id)` for reaction counts; same for comments. One SQL roundtrip per feed page.
- Comments lazy-loaded under each post: server returns the 3 most recent + total count; SPA shows a "show more" link that opens a modal/expansion with the full thread.
- If feed perf becomes an issue, denormalise `reactions_count` + `comments_count` columns on `community_posts` + Eloquent observer increment/decrement. Not V1.

### Push notification matrix (extends M5)

Three new categories added to the M5 opt-out matrix:

| Category | Trigger | Default opt-in? |
|---|---|---|
| `community_reply` | A user replies to a comment thread the recipient started | ✅ on |
| `community_event_new` | Owner creates a new event in the academy | ✅ on |
| `community_belt_celebration` | Someone in the academy is promoted | ❌ off — could be noisy in big academies |

Athletes manage these from `/dashboard/profile` § Notifications (existing UI from M5; just adds 3 rows).

## Scope by PR

V1 ships as 6 sequential PRs after M7 lands. Each PR should be reviewable in ≤ 30 minutes.

| # | Title | Scope |
|---|---|---|
| A | `feat(community): schema + models` | All 4 migrations + factories + Eloquent models + observer wiring. No HTTP, no UI. PEST factory + model tests. |
| B | `feat(community): belt-promotion auto-post + feed read API` | Observer on `Athlete::belt` change → creates `belt_promotion` post. Endpoint `GET /api/v1/community/feed` (paginated). Owner endpoint `DELETE /api/v1/community/posts/:id`. SPA `/portal/feed` page (read-only). |
| C | `feat(community): reactions` | `POST /community/posts/:id/reactions` (toggle), `DELETE`. Backend rate limit (60/min/user). SPA reaction buttons + signal-driven counts. |
| D | `feat(community): comments` | CRUD endpoints. Identity flair component implemented in this PR (reusable downstream). Owner can delete any comment. Comment thread component in SPA. |
| E | `feat(community): events + RSVP` | Owner CRUD for events (`POST /community/events`, etc.) — server-side creates the corresponding `event` community_post. RSVP endpoint. SPA event card with date/location/RSVP buttons. Owner dashboard view `/dashboard/community` with event list + create form. |
| F | `feat(community): push integration` | Wire `community_reply` / `community_event_new` / `community_belt_celebration` into M5's notification system. Backend `Notification` classes + delivery via existing WebPush stack. SPA: 3 new rows in `/dashboard/profile § Notifications`. |

Realistic timeline (post-M7): 3-4 weeks of focused work end-to-end.

## Out of scope — deferred to V2 and beyond

### V2 — Cross-academy + map

- Cross-academy event visibility (`visibility = 'public'`).
- Map view at `/portal/map` showing public events from other academies with a configurable radius (e.g. 50 km).
- Athlete profile pages (`/u/@handle`) viewable by other-academy athletes (limited info: handle + belt + academy name).
- "Follow academy" subscription (an academy's public posts appear in a follower's feed).
- Lat/lon geocoding pipeline for event addresses (V1 captures address text only; V2 geocodes on save via a server-side queue job).

**OPEN QUESTION on V2**: the user described the cross-academy map vision as "stile Tablo" — I (Claude) don't have a clear reference for what Tablo is. Possibly a martial-arts community app I'm not aware of, possibly Strava-like, possibly a check-in/discovery app. **Owner action**: clarify the Tablo reference in the M9 V2 design discussion before V2 starts, so the map UX matches the intent.

### V3+

- Photo uploads on posts and comments. Needs a separate DPIA pass even adults-only (EXIF stripping, NSFW automated check, copyright considerations, storage cost). The schema already has `payload` jsonb so adding `media[]` to event/announcement payloads is non-breaking.
- DMs (direct messages).
- Public competition results integration (Smoothcomp / IBJJF API ingestion → auto-post when an athlete competes).
- Tournament tracker (registration, weight classes, bracket display).
- Geofenced open-mat check-in.

## Success criteria

V1 is "working" when, on academies with ≥10 portal-registered adult athletes:

- 50%+ of registered adult athletes open `/portal/feed` at least once per month.
- 30%+ react to at least one post per month.
- 10%+ comment on at least one post per month.
- 0 minor accounts on the portal (registration gate works 100%).
- 0 moderation incidents an owner couldn't resolve via post/comment soft-delete within 24 h.
- p95 feed page load < 800 ms on cold cache.

## Open questions

- What does "Tablo" refer to in the V2 cross-academy map vision? (See V2 section.)
- Should owners be able to *post their own announcement* (the `owner_announcement` type exists in the enum) in V1, or wait for V2? Current default: not in V1 user stories, but enum reserves the slot. Decision deferred until first beta-test of V1.
- Should `clap` / `pray` reactions be configurable per academy (e.g. switching to `fire` / `100`)? Current decision: hard-coded V1, configurability deferred until 2+ academies request different defaults.
- Comment edit window — V1 has none (comment is delete-only by the author or the owner). Do we want a 5-minute edit window? Deferred until first complaint.

## References

- `docs/specs/m7-athlete-login.md` — athlete-portal foundation. M9 depends on it.
- `docs/specs/m5-notifications.md` — notification opt-out matrix that M9 extends.
- `users.handle` — schema convention from migration `2026_05_07_100000_split_user_name_into_first_last_and_add_handle.php` (Instagram-style, UNIQUE, lowercased, 30 chars max).
- `athletes.belt` — enum from `2026_04_22_130100_create_athletes_table.php` (IBJJF colours + kids / adult / senior coral).
- r/bjj subreddit flairs — UX reference for the identity flair component.
