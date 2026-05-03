## What

Stable release **v1.12.0**. Promotes 8 commits from `develop` to `main`. semantic-release will read the conventional-commit history below and tag `v1.12.0` automatically on merge.

## Why

Two user-visible flagships landed since `v1.11.0`:

- **🌍 Italian translation across the dashboard** — the full PR-C umbrella (#279) closed in five slices, covering every screen the instructor uses day-to-day.
- **🚪 Public landing page at /** (#330, #331) — root URL now serves a public marketing page; logged-in users still go straight to the dashboard.

User-facing release notes for both flagships are already shipped to `/dashboard/whats-new` via #342, in lock-step with the markdown source under `docs/changelog/user-facing/v1.12.0.md`.

## What ships

Eight commits between `v1.11.0` and `HEAD` of `develop`:

| Commit | Type | Summary |
| ------ | ---- | ------- |
| `8c322d2` | `feat` | Public landing page at `/` + login UX repositioning (#330, #331) — PR #335 |
| `41c118a` | `test` | Multi-viewport Cypress coverage for the 5 areas missing from #240 — PR #336 |
| `8b58a3f` | `feat` | i18n PR-C1 — Profile page (#279) — PR #337 |
| `3c4dd78` | `feat` | i18n PR-C4 — Expiring documents list + widget (#279) — PR #338 |
| `a8bdefc` | `feat` | i18n PR-C3 — Attendance area + shared `belts.*` namespace (#279) — PR #339 |
| `407d8eb` | `feat` | i18n PR-C5 — Academy area + shared `weekdays.*` namespace (#279) — PR #340 |
| `bb59736` | `feat` | i18n PR-C2 — Athletes list page + shared `statuses.*` namespace (#279) — PR #341 |
| `d48818d` | `chore` | v1.12.0 user-facing release notes — PR #342 |

semantic-release will compute the version bump as **minor** (5 × `feat`, no `BREAKING CHANGE`) → tag **`v1.12.0`** + GitHub release with the rendered changelog.

## Merge protocol

This PR uses a **merge commit** (NOT squash). The dev-changelog generator and the post-release `main → develop` sweep both depend on the merge-commit shape on `main`. Squashing a release PR is the project's #1 release-flow hazard — see `project_release_merge_style.md` in agent memory.

After merge:

1. semantic-release tags `v1.12.0` on `main` and publishes the GitHub Release (downstream job in the same workflow run).
2. The `release.yml` workflow auto-opens the canonical `chore/sync-main-into-develop-after-v1.12.0` PR (alignment-only — merges immediately, no Copilot wait, also a merge commit).
3. A `chore/techdebt-sweep-v1.12.0` branch follows from the post-sync `develop` HEAD per `feedback_post_release_techdebt_sweep.md`.

## Test plan

- [x] All 8 component PRs landed with green CI (12/12 checks each).
- [x] User-facing release notes shipped in lock-step (#342) — `whats-new.component.ts` array length 10, top card `v1.12.0`, vitest spec pin satisfied.
- [ ] CI green on this PR.
- [ ] Manual smoke after tag: `/dashboard/whats-new` top card reads "v1.12.0 — 2026-05-02".
- [ ] semantic-release tag + GitHub Release rendered with the v1.12.0 changelog.
- [ ] Auto-sweep PR `chore/sync-main-into-develop-after-v1.12.0` opened by the workflow.

## References

- Tracking umbrella: #279 (i18n PR-C)
- Tracking page: [Budojo project board](https://github.com/orgs/Budojo/projects/2)
- Previous stable: `v1.11.0` (2026-05-01)
- Release-flow rules: root `CLAUDE.md` § Release Flow + agent memory (`project_release_merge_style.md`, `feedback_release_pr_wait_for_copilot.md`, `feedback_post_release_techdebt_sweep.md`)
