## What

Cut v1.18.0 stable from develop. semantic-release will tag the merge commit on `main`.

Per project memory the release PR is **merge-committed**, NOT squashed — squashing breaks the downstream merge bookkeeping (semantic-release reads the merge commit's parents to identify the release range, and the auto-sweep `main → develop` PR depends on the commit graph to detect what to back-port).

## Payload

Two themes plus the consolidation backlog from the v1.17 train.

### 🥋 Athlete login — first slice

- **#449/#450** — `feat(users):` schema foundation. `users.role` enum (owner | athlete, default owner, backfilled), `athletes.user_id` UNIQUE FK, new `athlete_invitations` table with token-hash storage. `UserRole` enum + model relations + 13 PEST cases.
- **#452/#453** — `feat(athletes):` owner-side invite flow. `SendAthleteInvitationAction` with anti-squatting + lock-for-update race protection + best-effort mail. New endpoints `POST /athletes/{a}/invite[/resend]` and `DELETE /athletes/{a}/invitations/{i}`. SHA-256 token hash storage.
- **#454/#455** — `feat(auth):` athlete signup flow. `AcceptAthleteInvitationAction` with full transaction + UniqueConstraint backstop. Public `/athlete-invite/:token` page. Auto-login on accept.
- **#456/#457** — `feat(athletes):` role-based routing + welcome placeholder. `roleOwnerGuard` / `roleAthleteGuard` with bootstrap-race handling via `loadCurrentUser()` warm-up. `/athlete-portal/welcome` minimal placeholder.

### 💬 Consolidation (#446)

The dedicated `/dashboard/feedback` page was retired and folded into `/dashboard/support`. Single inbox, single sidebar entry, screenshot upload migrated, app-version + User-Agent auto-attach via the new `X-Budojo-Version` header.

### 📝 Documentation

- **#448** — M7 PRD at `docs/specs/m7-athlete-login.md`.
- **#447** — backfilled v1.17.0 user-facing release notes.
- **#451** — v1.18.0 user-facing release notes (this release).

## What's intentionally NOT in v1.18.0

- The full athlete dashboard pages (Profile / My academy / My attendance / My payments / My documents) — UX-heavy, deferred to next milestone for human review.
- The owner-side athlete-detail UI section that wires the new invite endpoints into a button — deferred as PR-B-UI to next train.
- The `is_visible_to_peers` opt-in scaffold — deferred as PR-G to next milestone.
- Server-side `role:` middleware sweep on owner endpoints — deferred as PR-F to next milestone.

## Hard rules locked in this release (non-negotiable)

1. Public `/auth/register` ALWAYS produces `role=owner`. Athletes cannot self-register.
2. Token-invite from the academy owner is the ONLY path to becoming `role=athlete`.
3. Invite tokens are stored as SHA-256 hashes, never as plaintext.
4. Owners and athletes occupy distinct URL spaces (`/dashboard` vs `/athlete-portal`) gated by role.

## Test plan

- [x] All M7 PRs landed CI-green on develop
- [x] PEST 492 / 1593 assertions on develop
- [x] Vitest 632 specs on develop
- [x] Cypress E2E green across shards
- [x] Spectral OpenAPI lint clean
- [ ] Merge this PR with **"Create a merge commit"** (NOT squash) per project memory
- [ ] Verify `release.yml` GitHub Action tags `v1.18.0` after merge
- [ ] Verify the auto-sweep `main → develop` PR opens itself (`chore/sync-main-into-develop-after-v1.18.0`)
- [ ] Open Whats new at `/dashboard/whats-new` after deploy and confirm v1.18.0 card paints first

## References

- Closes the v1.18.0 release train.
- Sub-PRs: #446, #447, #448, #449/#450, #451, #452/#453, #454/#455, #456/#457.
- M7 umbrella issue: #445 (will get the umbrella update once the next train ships PR-E + the owner-side UI section).
