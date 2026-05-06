## What

Adds the user-facing release notes for v1.18.0 in the canonical pair:

- `docs/changelog/user-facing/v1.18.0.md` — the markdown source.
- A new `Release` entry prepended to the typed `releases` array in `client/src/app/features/whats-new/whats-new.component.ts`.

The matching spec (`whats-new.component.spec.ts`) is bumped to expect 19 cards with `v1.18.0` at index 0 — that's the regression-catching trip-wire by design.

## Why

Per `CLAUDE.md` § "User-facing changelog (#254)" + project memory: every stable release adds the markdown file AND prepends the typed array entry in the same commit history as the release train.

This v1.18.0 entry has to land BEFORE the develop → main release PR is cut, so the SPA on production carries the right whats-new content from the moment v1.18.0 is tagged.

## How

The release covers the user-visible work accumulated on develop since v1.17.0:

- **#446** (consolidation feedback → support) — this is the main user-visible change. Single contact channel, screenshot upload migrated, X-Budojo-Version + User-Agent auto-attach, "Feedback" category added, sidebar icon changed from life-ring to speech-bubble.
- **#450** (M7 PR-A — schema foundation) — schema-only, invisible to users. Mentioned in "Behind the scenes" so the reader has context for the next milestone but no surface promised.

Note: PR #450 is still in flight at the time of writing this PR. The order matters: #450 must merge to develop BEFORE this PR is merged so the v1.18.0 release train carries the schema work.

## Test plan

- [x] `npm test -- --watch=false` — 618 specs pass (the bumped count assertion + version-order pin in `whats-new.component.spec.ts` validates the new entry sits at index 0)
- [x] `npm run lint` — clean
- [ ] After merge: spot-check `/dashboard/whats-new` in the browser — v1.18.0 card paints first, both sections render with their emoji headings

## References

- Closes the v1.18.0 docs/code lock-step gap.
- Sequenced after PR #450 (M7 PR-A) to ensure the v1.18.0 release tag carries both.
- Related: PR #447 (v1.17.0 backfill), follows the exact same shape.
