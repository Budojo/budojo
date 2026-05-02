## Release develop → main

Promotes the current `develop` tip to `main`. semantic-release reads the conventional commits below and cuts the tag automatically. One `feat:` commit (#327 unpaid-this-month widget) → minor bump → next version: **v1.11.0**.

> **Merge style:** "Create a merge commit" — NOT squash. The merge commit is what semantic-release tags + what the post-release sweep brings back into develop.

> **Auto-sweep first production test:** the sweep job that opens `chore/sync-main-into-develop-after-v1.11.0` now lives **inside** `release.yml` as a downstream job (was a separate workflow until #329 collapsed it). This release is the first chance to verify the auto fires for real. If the *Settings → Actions → General → Allow GitHub Actions to create and approve PRs* repo toggle is still off, the job will fail at `gh pr create` with the documented message and we fall back to manual.

## What ships in this release

### 🛟 New surface — chasing payments

- **`feat(payments)`: unpaid-this-month widget on the dashboard home** (#327, closes #283). New tile on the dashboard sandwiched between the expiring-documents tile and the monthly-attendance tile. Shows the count of athletes who haven't paid the current month + the first 5 names as deep-links to each athlete's Payments tab + a "View all" CTA to `/dashboard/athletes?paid=no`. Two visibility gates: monthly fee configured AND today is on or after the 16th of the month. Otherwise self-hides — zero noise for academies that don't track payments through Budojo.

### 🐛 Cosmetic polishes (Copilot catches you flagged on screenshots)

- **`fix(payments)`: payments-list rows now uniform height — pin actions-cell children to 2rem** (#324, closes #317). v1.10.0's "rows line up at last" was actually horizontal-rhythm-only; the bare text-dash placeholder undershot the icon-button height by ~8px so the table still read jumpy. The dash placeholder now matches the icon-button height exactly.
- **`fix(ui)`: datepicker composite chrome — single rounded outer shell** (#325, closes #318). Every form field with a calendar trigger (Date of birth, Joined, Document expires_at / issued_at, daily attendance) now renders as a single rounded outer rectangle with no inner seam. Hover and focus light up the whole composite via `:focus-within`.

### 🔧 Infrastructure (the org transfer + auto-sweep cleanup)

- **`chore(feedback)`: switch OWNER_EMAIL to matteo.bonanno@budojo.it** (#323, closes #322). Domain mailbox on Zoho replacing the placeholder personal Gmail. Survives an ownership change because the address belongs to the product domain.
- **`chore(infra)`: post-org-transfer cleanup — m-bonanno → Budojo references** (#326). Bulk update of hardcoded references after the repo moved from `m-bonanno/budojo` to `Budojo/budojo`. Mostly the helper scripts and `info.contact.url`.
- **`chore(infra)`: board-set.sh — point at the migrated org-level project** (#328). Project board moved from `m-bonanno`'s personal Project #2 to the new org-level project at `/orgs/Budojo/projects/2`, complete with `copyProjectV2` + a one-shot bulk import that preserved all 250 items + their statuses.
- **`ci(release)`: fold the post-release sweep into release.yml as a downstream job** (#329). Both previous trigger attempts on the standalone workflow (`release: published`, `push: tags:`) silently no-op'd because GitHub Actions refuses to fire downstream workflows on events created by `GITHUB_TOKEN`. The sweep is now a job inside `release.yml` that runs after the release job, gated on a stable tag at HEAD. Same workflow run, no cross-workflow trigger.

### 📰 Changelog

- **`docs(changelog)`: v1.11.0 user-facing release notes** (#332) — markdown source under `docs/changelog/user-facing/v1.11.0.md` + prepended typed Release entry on the What's new page. Vitest order-pin spec and Cypress visibility spec both updated.

## User-facing changelog (#254 discipline)

This release ships its v1.11.0 entry in lock-step:

- `docs/changelog/user-facing/v1.11.0.md` — markdown source.
- `client/src/app/features/whats-new/whats-new.component.ts` — typed `releases` array, v1.11.0 prepended.

Pinned by the vitest spec (`renders every shipped release in newest-first order` now asserts v1.11.0 first + 9 cards total) and the Cypress visibility spec (`whats-new-release-v1.11.0` is the visible-on-landing card).

## Release flow checklist

- [x] All v1.11.0 commits land on `develop` via individual PRs (squash-merged).
- [x] User-facing changelog entry merged (#332).
- [ ] Merge this PR with **"Create a merge commit"** (NOT squash) — semantic-release on `main` reads the merge commit and tags `v1.11.0`.
- [ ] After tag lands, the new in-workflow sweep job (#329, first production run) auto-opens `chore/sync-main-into-develop-after-v1.11.0`. Watch for it; manual fallback if the repo-setting toggle is off.
- [ ] Post-release tech-debt + docs sweep: optional this train (we just did one for v1.10.0 + v1.10.1).

## References

- Release config: `.releaserc.json`
- Discipline doc: CLAUDE.md § Release Flow
- Post-org-transfer state: CLAUDE.md § GitHub Project Board
- Auto-sweep architecture: `.github/workflows/release.yml` § sweep job
