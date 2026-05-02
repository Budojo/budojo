## Release develop → main

Promotes the current `develop` tip to `main`. semantic-release reads the conventional commits below and cuts the tag automatically. One `fix:` commit since v1.10.0 → patch bump → next version: **v1.10.1**.

> **Merge style:** "Create a merge commit" — NOT squash. The merge commit is what semantic-release tags + what the post-release sweep brings back into develop.

## What ships in this release

### 🐛 Fixes (all release-flow plumbing)

- **`fix(release)`: v1.10.1 patch — Copilot catches from #314 + auto-sweep gotchas** (#316). Five things in one commit:
  - **`feat(feedback)` follow-up:** `feedback.blade.php` switched from `{{ }}` to `{!! !!}` for user-supplied / server-derived fields. Blade's default `{{ }}` calls `htmlspecialchars` even on text/plain Mailables, so the owner saw `&amp;` / `&lt;` literally in feedback emails. Inline blade-comment notes the safety condition (Content-Type IS `text/plain`; revert to `{{ }}` if that ever changes).
  - **`docs(api)`:** `- name: feedback` added to the top-level `tags:` list in `docs/api/v1.yaml`. Closes the `operation-tag-defined` Spectral warning that fired on every `/feedback` endpoint after v1.10.0.
  - **`ci(release)`:** `post-release-sweep.yml` trigger switched from `release: published` → `push: tags: ['v*.*.*', '!v*-beta*']`. The previous trigger never fired in production — GitHub Actions refuses to run downstream workflows on `release.published` events created by `GITHUB_TOKEN` (recursion safeguard); semantic-release publishes via that token. Tag pushes DO fire under it.
  - **`ci(release)` defense-in-depth:** new `Verify the tag commit is reachable from main` step does `git merge-base --is-ancestor` against `origin/main`. Tag-name globs filter the NAME but not the commit's reachability — guards against a stable-looking tag accidentally pointing at an unmerged commit.
  - **`docs(claude)`:** Release Flow section in `CLAUDE.md` now documents the auto-sweep prerequisites: the repo-level `Settings → Actions → General → Allow GitHub Actions to create and approve pull requests` toggle, and the `push: tags` trigger gotcha.

## Out of scope (not blocking, tracked for v1.11.x)

- **#317** `fix(payments)`: payments-list rows still not uniform height — dash placeholder shorter than icon-button rows. Cosmetic regression from #304.
- **#318** `fix(ui)`: datepicker composite (input + calendar trigger) — detached look, broken radius + padding. Generic to every field with a calendar button.

## User-facing changelog (#254 discipline)

No `whats-new` entry for v1.10.1 — the patch is purely release-flow plumbing with no user-visible change. Convention: only minor / major releases get a What's new card; patches like v1.9.1-beta.1 don't either.

## Release flow checklist

- [x] All v1.10.1 commits land on `develop` via individual PRs (squash-merged).
- [x] No user-facing changelog entry — patch with no user-visible change.
- [ ] Merge this PR with **"Create a merge commit"** (NOT squash) — semantic-release on `main` reads the merge commit and tags `v1.10.1`.
- [ ] After tag lands, the now-corrected sweep workflow (`push: tags: 'v*.*.*'` trigger) should fire on its own and open `chore/sync-main-into-develop-after-v1.10.1`. **First production test of the corrected trigger.** If the repo-level "Allow GitHub Actions to create and approve PRs" toggle isn't on, the workflow will succeed up to the `gh pr create` step then fail with a known message — manual fallback documented in the v1.10.0 sweep PR (#315).
- [ ] Post-release tech-debt sweep: deferred to a later batch (v1.10.0 + v1.10.1 are too close to warrant two sweeps).

## References

- Release config: `.releaserc.json`
- Discipline doc: CLAUDE.md § Release Flow (now with the auto-sweep prerequisites note that this very release adds)
- Predecessor: v1.10.0 release PR (#314), v1.10.0 sweep (#315)
