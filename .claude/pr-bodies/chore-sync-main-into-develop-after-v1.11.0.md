## What

Sweep branch for tag **v1.11.0**. Brings the release merge commit from `main` (`6e535757`) back into `develop` so semantic-release on the next `develop` push reads the right base for the next beta tag.

> **Merge style:** "Create a merge commit" — NOT squash. Squash erases the parent linkage and breaks downstream merge bookkeeping (memory `project_release_merge_style.md`).

> **Copilot wait:** none. Alignment-only — no new code, no review surface (memory `feedback_release_pr_wait_for_copilot.md`).

## Why

Without the sweep, `develop`'s next beta tag stays on the OLD train (semantic-release can't see the new stable tag from `develop`'s history).

## What's in the diff

The release merge commit from `main` (`6e535757`) — the v1.11.0 tag commit. No new code; alignment.

## Note: first auto-sweep production run did its part — the repo toggle is the missing piece

The auto-sweep architecture from #329 (sweep job inside `release.yml` instead of a separate workflow) **executed all of its steps successfully** on this release:

- Resolved tag → `v1.11.0` ✓
- Checked out the tag ✓
- Verified ancestry against `origin/main` ✓
- Cut + pushed `chore/sync-main-into-develop-after-v1.11.0` ✓
- ❌ Failed at `gh pr create` with: *"GitHub Actions is not permitted to create or approve pull requests"*

This is the third release where the same repo-level setting blocks the final step:

**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** must be **enabled**. One-time admin toggle. Documented in CLAUDE.md § Release Flow as the prerequisite, but the toggle still hasn't been flipped.

Once that toggle is on, the sweep PR for v1.12.0 onwards will open automatically with no human intervention.

This sweep PR was opened manually via `gh pr create` to keep the v1.11.0 release flow moving.

## References

- Release tag: [v1.11.0](https://github.com/Budojo/budojo/releases/tag/v1.11.0)
- Auto-sweep architecture: `.github/workflows/release.yml` § sweep job
- Predecessor sweeps: #315 (v1.10.0), #321 (v1.10.1)
