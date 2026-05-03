## What

User-facing changelog entry for **v1.10.0**, opened on the chore branch BEFORE the `develop → main` release PR per the discipline in CLAUDE.md § "User-facing changelog (#254)".

## Why

Every stable release ships two artefacts in lock-step:

- `docs/changelog/user-facing/v{X.Y.Z}.md` — the citable markdown source
- A typed `Release` entry prepended to the array in `whats-new.component.ts`

Plus the vitest spec that pins the version order (`renders every shipped release in newest-first order`) — bumped from 7 → 8 entries; without that bump, the regression trip-wire fails on merge.

## How

Three user-facing changes since v1.9.0 are folded in:

- **🛟 In-app feedback** — the new `/dashboard/feedback` page (#311 / #312) with subject + description + optional screenshot.
- **⚡ Auto-update** — PWA auto-activates new SW versions and reloads (#305) instead of leaving returning users on a stale bundle.
- **🐛 Fixes** — payments row height (#304).

The other commits since v1.9.0 are tooling / CI / chore (#307 sweep, #308 PR template, #309 auto-sweep workflow, #310 cypress matrix) and are deliberately omitted from the user-facing notes.

## Out of scope

- Italian translation of the new entry. The What's new page is English-only today; the i18n rollout for `/dashboard/whats-new` lives in a separate ticket.

## References

- Closes part of the v1.10.0 release prep (no specific issue — this PR IS the changelog).
- Matches discipline in CLAUDE.md § User-facing changelog and memory `feedback_release_whats_new_lockstep.md`.

## Test plan

- [x] `./.claude/scripts/test-client.sh` — prettier + lint + vitest green (402 tests, including the bumped order pin)
- [x] Manual verification: `expect(cards.length).toBe(8)` and the version array now leads with v1.10.0
- [ ] Cypress green in CI
