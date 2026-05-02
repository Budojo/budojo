## Release develop → main

Promotes the current `develop` tip to `main`. semantic-release will cut a tag automatically based on the conventional commits below. One `feat:` commit (#297) → minor bump (next version: **v1.9.0**).

> **Merge style:** "Create a merge commit" — NOT squash. The merge commit is what semantic-release tags + what the post-release sweep brings back into develop.

## What ships in this release

### 🌍 Languages (the headline — finishes the v1.8.0 promise)

- **`feat(i18n)`: wire auth + setup + chrome + 404 templates to translation keys (PR-B, #278)** (#297) — second wave of the SPA i18n push. Auth login + register + verify-success + verify-error, the setup wizard, the dashboard chrome (top bar + brand area), and the 404 page now all read from translation keys; toggling language inside the dashboard finally flips the screens you see *before* you ever sign in. JSON files (`en.json`/`it.json`) updated in lock-step; `i18n-keys.spec.ts` parity check still green.
- **`fix(privacy)`: swap canonical /privacy default to English** (#291, #292) — `/privacy` cold-load now lands on English, matching the new EN-default product direction. Italian one tap away via the in-page toggle; users with the dashboard language set to IT keep landing on Italian automatically.

### 🥋 Athletes

- **`refactor(athletes)`: drop folder icon from list, move Edit into the detail as a sub-tab (#281)** (#298) — Edit becomes a tab next to Documents / Attendance / Payments on each athlete's page; saving / cancelling stays on the athlete. List drops the redundant folder icon — tap the athlete name to enter the detail (standard list-link pattern). Form navigation rewired (Copilot review follow-up in 590aac8) so the user never gets bounced back to the list mid-edit.
- **`fix(athletes)`: "Paid" column discloses the current month (#282)** (#289) — the athletes-list "Paid" column header now writes the current month (e.g. "Paid (May)") so the toggle's semantics are unambiguous.

### 🛡️ Profile

- **`fix(profile)`: "Your data" card stacks vertically per the canon (#284)** (#290) — the card under Profile that lists name / email / created-on now stacks vertically on narrow screens instead of sprawling horizontally. Matches the rest of the Profile page rhythm.

### 🔧 Tooling

- **`chore(scripts)`: .claude/scripts/ helpers (board, copilot, docker gates) + per-PR bodies** (#293) — the agent's daily workflow helpers (board state transitions, Copilot reply pipeline, the test-server / test-client gate runners) finally live in the repo so they're shared instead of one-off shell snippets.
- **`chore(scripts)`: test-client.sh prettier no longer dies on a clean tree** (#299) — guard the prettier gate against the no-match exit-1 from `grep -v unchanged`. Tightened (post Copilot review, c00f079) so only exit 1 is promoted to success — real grep failures (exit 2) still propagate.

### 📰 Changelog

- **`docs(changelog)`: v1.9.0 user-facing release notes** (#300) — markdown + typed array entry per the lock-step rule.

### 📝 Docs / internal

- **`docs(claude)`: document the post-release tech-debt sweep discipline** (#288) — root `CLAUDE.md` + agent-side memory doc capture the sweep checklist that runs after every stable.
- **`fix(i18n)`: apply Copilot review on v1.8.0 release PR — #285 incident follow-up** (#286) — closes the loop on the Copilot comments that landed too late on the v1.8.0 release PR.

## User-facing changelog (#254 discipline)

This release ships its v1.9.0 entry in lock-step:

- `docs/changelog/user-facing/v1.9.0.md` — markdown source.
- `client/src/app/features/whats-new/whats-new.component.ts` — typed `releases` array, v1.9.0 prepended.

Pinned by the vitest spec (`renders every shipped release in newest-first order` asserts v1.9.0 first + 7 cards total).

## Honest notes on i18n scope

PR-B (#297) covers the **chrome + auth + setup + 404**. The dashboard page bodies — Athletes, Attendance, Documents, Academy, Profile — are still English-source-only and don't yet read from translation keys. Tracked under #279 (PR-C umbrella). Toast / error / locale-aware formatting is PR-D (#280). English users see the exact same SPA; Italian users now see Italian on the entry surfaces and Italian sidebar / privacy from v1.8.0, with the dashboard pages still English until the next i18n waves land.

## Release flow checklist

- [x] All beta-train commits land on `develop` via individual PRs (squash-merged).
- [x] User-facing changelog entry merged (#300).
- [ ] Merge this PR with **"Create a merge commit"** (NOT squash) — semantic-release on `main` reads the merge commit and tags `v1.9.0`.
- [ ] After tag lands, open `chore/sync-main-into-develop-after-v1.9.0` to bring the merge commit back into develop.
- [ ] Post-release tech-debt + docs sweep on a `chore/techdebt-sweep-v1.9.0` branch from develop.

## References

- Release config: `.releaserc.json`
- Tracking: #271 (i18n umbrella)
- Beta predecessors on this branch: `v1.9.0-beta.N` (auto-tagged on each `develop` merge — semantic-release picks the train name automatically)
- Previous release: #276 (v1.8.0)
