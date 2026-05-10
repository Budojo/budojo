## What

Add the v2.4.0 entry to the user-facing changelog (`/dashboard/whats-new`) — must land in develop BEFORE the v2.4.0 release PR is opened so the release ships with the entry already in place.

## Why

Per `CLAUDE.md` § "User-facing changelog (#254)", every stable release adds:
- `docs/changelog/user-facing/v{X.Y.Z}.md` — the markdown source.
- A prepended `Release` entry in the typed array in `client/src/app/features/whats-new/whats-new.component.ts`.

Both kept in lock-step by hand; the trip-wire spec in `whats-new.component.spec.ts` fails when one is missing.

## How

- New `docs/changelog/user-facing/v2.4.0.md` covering:
  - 🐛 Profile pencil affordance no longer falls under the value on iPhone (PR #547)
  - 🐛 Age chip + kid-variant belt label no longer wrap on narrow viewports (PR #547, applies to Athletes list AND Attendance)
  - 🛡️ SPA cache-bust safety net — `version.json` poll on focus + 20-min interval, `?force-update=1` recovery URL, network blips silently absorbed (PR #549)
  - 🔧 Post-v2.3.2 tech-debt sweep findings (PR #546)
- Prepended typed `Release` entry in `whats-new.component.ts`.
- Trip-wire spec updated: latest-card assert flips to `v2.4.0`, total-card count rolls 26 → 27, the pinned versions array prepends `v2.4.0`.

## Out of scope

- The v2.4.0 release PR itself (`develop → main`) — opens after this lands.

## Test plan

- [x] `npm test` — 721 specs green, including the whats-new trip-wire (4 tests in `whats-new.component.spec.ts`)
- [x] Prettier + lint clean
- [ ] Manual smoke after merge: `/dashboard/whats-new` lists `v2.4.0` at the top with the 4 sections
