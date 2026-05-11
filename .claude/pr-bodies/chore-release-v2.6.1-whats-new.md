## What

Pre-release lockstep for v2.6.1, the next stable tag semantic-release will cut on the develop → main merge:

1. New `docs/changelog/user-facing/v2.6.1.md` — markdown source for the user-facing changelog.
2. Prepended `Release` entry for v2.6.1 in `client/src/app/features/whats-new/whats-new.component.ts` (the typed array `releases`).
3. Updated `whats-new.component.spec.ts` — the order-pinning specs (`renders the title and the latest release at the top` + `renders every shipped release in newest-first order`) now expect v2.6.1 at index 0 and `length === 30` instead of 29.

Standard pre-release chore PR. Per the release flow in CLAUDE.md, this lands in develop FIRST, then the develop → main release PR follows.

## Why

The v2.6.1 stable will collect:

- 1 user-visible UX fix: the `/auth/verify-error` resend button now shows a loading spinner during the HTTP request (#585 / PR #586). One bullet of user-facing copy.
- 3 internal refactors: `EmailChangeController` namespace move (#581), `<app-verify-page>` shared chrome extract (#582), `Actions/Account/*` redistribution (#584). Invisible to users but cleans the foundation for M7 athlete-login work.
- 5 new Vitest specs for previously-untested Angular components (verify-success, verify-error, athlete-portal-welcome, notification-bell, athlete-invite — PRs #589 / #590 / #591 / #592 / #593, slices of umbrella #588). 35+ new tests.
- 2 internal docs entries: graphify integration (PR #578) and two new gotchas (PRs #587 + #594).

semantic-release will see exactly one `fix:` commit since v2.6.0 and tag this as a patch. The beta-tag train confirms: `v2.6.1-beta.1` already exists on develop.

## How

- Markdown copy follows the v2.3.1 / v2.3.2 / v1.14.1 patch-release tone — small, conversational, one visible fix headline + a behind-the-scenes block.
- Typed `Release` entry mirrors the shape used in every prior entry. Sections grouped by emoji-prefixed heading; bullets are full sentences.
- Spec update is one-line + one-line — adds `'v2.6.1'` at array index 0 and bumps the length from 29 to 30. The pin test is the trip-wire by design — it fired exactly when I tried to merge without updating, so the lockstep works as documented in the `whats_new_lockstep` memory.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 99 spec files, 828 tests (whats-new pin specs now expect v2.6.1)
- [x] Locally diffed `docs/changelog/user-facing/v2.6.1.md` against v2.6.0 to confirm tone match
- [ ] CI green (prettier + lint + vitest + cypress + the PHP / OpenAPI / Worker jobs that don't touch this area)

### Post-merge

- Open the develop → main release PR. semantic-release auto-tags `v2.6.1` + creates the GitHub Release whose body is the auto-generated changelog (separate from the user-facing one in this PR — both keep going).
- The post-release sweep job opens the `chore/sync-main-into-develop-after-v2.6.1` PR automatically; it merges itself once CI clears (per the existing automation).

## Provenance

Triggered by the user explicitly during a marathon session: "fai rilascio quando ritieni opportuno". The session shipped 6 substantive PRs (3 refactor + 1 fix + 2 docs + 5 tests) since v2.6.0 — appropriate cut point even though the user-visible content is just the one resend-button spinner.
