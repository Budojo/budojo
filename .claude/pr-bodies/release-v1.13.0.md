## What

Stable release **v1.13.0**. Promotes 7 commits from `develop` to `main`. semantic-release will read the conventional-commit history below and tag `v1.13.0` automatically on merge.

## Why

One user-visible flagship landed since `v1.12.1`:

- **🌍 Italian translation completes the dashboard** — v1.12.0 covered the pages users open day-to-day; this train finishes the job. Athlete detail tabs (Documenti / Presenze / Pagamenti / header), athlete form (every label, validation, dropdown option, button), and the `nav.academy` IT bug are all now fixed. After v1.13.0 there is no surface in the dashboard where an Italian user sees English by mistake.

User-facing release notes are already shipped to `/dashboard/whats-new` via #360, in lock-step with the markdown source under `docs/changelog/user-facing/v1.13.0.md`.

## What ships

Seven commits between `v1.12.1` and `HEAD` of `develop`:

| Commit | Type | Summary |
| ------ | ---- | ------- |
| `45ede9a` | `chore` | Map `hotfix:` commit type to patch in semantic-release config — PR #352 |
| `898c9d1` | `docs` | Refresh stale `m-bonanno` repo URL in `docs/legal/cookie-audit.md` — PR #353 |
| `3d453cc` | `fix` | i18n sweep — landing + athletes-list + legal + shared widgets (#344 closed) — PR #354 |
| `d161333` | `feat` | i18n — athletes detail sub-tab templates (payments, documents, attendance, header) (#355 closed) — PR #356 |
| `1f7c48b` | `feat` | i18n — athlete form (labels, validation, belt/status/country options) (#357 closed) — PR #358 |
| `0316ca1` | `chore` | Bump angular ecosystem to 21.2.11/21.2.9 and jsdom 28→29 (refs #306) — PR #359 |
| `38c6f0b` | `chore` | v1.13.0 user-facing release notes — PR #360 |

semantic-release will compute the version bump as **minor** (2 × `feat`, no `BREAKING CHANGE`) → tag **`v1.13.0`** + GitHub release with the rendered changelog.

## Out of scope

- Cypress 13 → 15, TypeScript 5.9 → 6.0, phpunit 12 → 13 (still deferred on #306 — each needs its own focused PR with a test re-pass)
- Compliance work (#220 DPA, #223 hard-delete + payments retention, #224 encrypt medical certs, #227 DPIA-lite) — separate workstream
- Multi-market i18n (#271 EN→ES→DE epic) — long-running

## How

Standard release flow per `CLAUDE.md` § Release Flow + memory `project_release_merge_style`:

- Merge commit (NOT squash) so semantic-release reads the develop train
- "Allow GitHub Actions to create and approve pull requests" must be enabled (one-time setting; previously verified)
- After merge, the auto-sweep job in `release.yml` opens `chore/sync-main-into-develop-after-v1.13.0` automatically; that sweep PR ships independently per `feedback_release_pr_wait_for_copilot` (alignment-only, merges immediately)

## References

- Implements `feedback_release_whats_new_lockstep` — what's-new chore (#360) shipped before this release PR opened
- Closes umbrella #279 (full i18n dashboard coverage) — already manually closed during the umbrella sweep

## Test plan

- [ ] CI green on the PR
- [ ] On merge, semantic-release tags `v1.13.0` on `main` and publishes the GitHub release with the rendered conventional-commit changelog
- [ ] Cloudflare deploy succeeds (no infra surprises after #347 / #349 stabilised the pipeline)
- [ ] Production URL serves the new SPA at `/` and `/dashboard/whats-new` shows the v1.13.0 card on top
- [ ] IT-locale smoke: `/dashboard/athletes/<id>/payments` reads in Italian end-to-end (column headers, mark-paid confirm, status tags)
- [ ] Auto-sweep PR `chore/sync-main-into-develop-after-v1.13.0` opens automatically after the release tag publishes
