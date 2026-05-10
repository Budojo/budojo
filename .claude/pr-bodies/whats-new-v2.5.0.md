## What

Add the v2.5.0 entry to the user-facing changelog (`/dashboard/whats-new`). Must land in develop BEFORE the v2.5.0 release PR is opened so the release ships with the entry already in place.

## Why

Per `CLAUDE.md` § "User-facing changelog (#254)", every stable release adds:
- `docs/changelog/user-facing/v{X.Y.Z}.md` — the markdown source.
- A prepended `Release` entry in the typed array in `client/src/app/features/whats-new/whats-new.component.ts`.

Both kept in lock-step by hand; the trip-wire spec in `whats-new.component.spec.ts` fails when one is missing.

## How

- New `docs/changelog/user-facing/v2.5.0.md` covering the four security & notifications panels:
  - 🛡️ One-click cancel of a scheduled account deletion (PR #557, closes #545)
  - 🛡️ Active sessions list with per-row revoke (PR #558, closes #413)
  - 🛡️ Login history with failed-attempts surfacing (PR #559, closes #430)
  - 🛡️ Email notification preferences with optimistic toggles (PR #560, closes #416)
- Prepended typed `Release` entry in `whats-new.component.ts`.
- Trip-wire spec updated: latest-card assert flips to `v2.5.0`, total-card count rolls 27 → 28, the pinned versions array prepends `v2.5.0`.
- Cypress visibility assertion bumped to the new `data-cy="whats-new-release-v2.5.0"` hook.

## Out of scope

- The v2.5.0 release PR itself (`develop → main`) — opens after this lands.

## Test plan

- [x] `npm test` — 751 specs green, including the whats-new trip-wire (4 tests in `whats-new.component.spec.ts`)
- [x] Prettier + lint clean
- [ ] Manual smoke after merge: `/dashboard/whats-new` lists `v2.5.0` at the top with the 4 sections
