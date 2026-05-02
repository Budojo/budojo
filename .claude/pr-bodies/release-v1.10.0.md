## Release develop → main

Promotes the current `develop` tip to `main`. semantic-release reads the conventional commits below and cuts the tag automatically. Two `feat:` commits (#305 PWA auto-update and #312 in-app feedback) → minor bump → next version: **v1.10.0**.

> **Merge style:** "Create a merge commit" — NOT squash. The merge commit is what semantic-release tags + what the post-release sweep brings back into develop.

## What ships in this release

### 🛟 New surface

- **`feat(feedback)`: in-app feedback form with email-to-owner + version + device info** (#311 / #312) — new `/dashboard/feedback` page lets a signed-in user post a subject + description (and an optional ≤5 MB png/jpeg/webp screenshot). Server emails the product owner with the message, the SPA build tag, and the request User-Agent — so triage doesn't need a follow-up "what version are you on?" ping. Sidebar entry sits above What's new (active path > passive changelog in the read order).

### ⚡ Reliability

- **`feat(pwa)`: auto-activate + reload on new SW version, periodic check** (#305) — returning users no longer linger on a stale bundle until a manual hard-refresh. `AppUpdateService` wires `SwUpdate.versionUpdates` to `activateUpdate()` + reload on `VERSION_READY`, plus a 1-hour periodic `checkForUpdate()` for long-lived mobile sessions. Trade-off: a reload mid-form-fill loses unsaved data; forms here are short, so the win (always on the latest fix) outweighs the cost.

### 🐛 Fixes

- **`fix(payments)`: uniform row height — icon-only mark/unmark + dash placeholder** (#304) — Payments tab on each athlete profile now renders rows at a consistent height regardless of state (paid / unpaid / empty month). Mark/unmark controls collapsed to icon-only; empty months carry a dash placeholder. Reads as a clean grid instead of a slightly jumpy one.

### 🔧 CI / tooling / docs

- **`chore: tech-debt + docs sweep — post v1.9.0`** (#307) — canonical post-release sweep: TODO triage, dependency check, route audit, doc parity vs. migrations / OpenAPI / DESIGN_SYSTEM. Empty findings is a valid outcome — this sweep documented the all-clear state.
- **`chore(github)`: add default PR body template** (#308) — `.github/PULL_REQUEST_TEMPLATE.md` auto-populates the canonical What / Why / How / Notes / Out of scope / References / Test plan skeleton on UI-opened PRs. CLAUDE.md item 2 updated to match.
- **`ci(release)`: auto-open main → develop sweep PR on `release.published`** (#309) — fires on stable tag publish, opens the canonical `chore/sync-main-into-develop-after-vX.Y.Z` PR. First production run will be on this very release. Tag-resolved checkout, `--force-with-lease` for re-run idempotency, `--body-file` for the PR body, `target_commitish == 'main'` guard. Manual fallback via `workflow_dispatch` is wired.
- **`ci(cypress)`: manual matrix sharding (4 parallel shards)** (#310) — Cypress wall-clock dropped from ~5 min to ~1.5 min by sharding spec list across 4 runners. `find` enumeration is `set -eo pipefail`-safe.

### 📰 Changelog

- **`docs(changelog)`: v1.10.0 user-facing release notes** (#313) — markdown + typed array entry per the lock-step rule.

## User-facing changelog (#254 discipline)

This release ships its v1.10.0 entry in lock-step:

- `docs/changelog/user-facing/v1.10.0.md` — markdown source.
- `client/src/app/features/whats-new/whats-new.component.ts` — typed `releases` array, v1.10.0 prepended.

Pinned by the vitest spec (`renders every shipped release in newest-first order` now asserts v1.10.0 first + 8 cards total) and the Cypress visibility spec (`whats-new-release-v1.10.0` is the visible-on-landing card).

## Release flow checklist

- [x] All beta-train commits land on `develop` via individual PRs (squash-merged).
- [x] User-facing changelog entry merged (#313).
- [ ] Merge this PR with **"Create a merge commit"** (NOT squash) — semantic-release on `main` reads the merge commit and tags `v1.10.0`.
- [ ] After tag lands, the `Post-release main → develop sweep` workflow (#309, first production run) auto-opens `chore/sync-main-into-develop-after-v1.10.0`. Verify it fires; manual fallback via `workflow_dispatch` if it doesn't.
- [ ] Post-release tech-debt + docs sweep on a `chore/techdebt-sweep-v1.10.0` branch from develop.

## References

- Release config: `.releaserc.json`
- Discipline doc: CLAUDE.md § Release Flow
- Sweep discipline: CLAUDE.md § Post-release tech-debt + docs/code cleanup sweep
