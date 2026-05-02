## What

Manually opened (workflow sweep step failed because *Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"* is off — known case, documented in root `CLAUDE.md` § Auto-sweep main → develop). Brings the release merge commit from `main` back into `develop` so semantic-release on the next `develop` push reads the right base for the next beta tag.

> **Merge style:** "Create a merge commit" — NOT squash. Squash erases the parent linkage and breaks downstream merge bookkeeping (memory `project_release_merge_style.md`).

> **Copilot wait:** none. Alignment-only — no new code, no review surface (memory `feedback_release_pr_wait_for_copilot.md`).

## Why

Without the sweep, `develop`'s next beta tag stays on the OLD train (semantic-release can't see the new stable tag from `develop`'s history).

## What's in the diff

The release merge commit from main (only — the workflow already cut the branch from the `v1.12.0` tag).

## Manual follow-up

- The repo setting that lets GitHub Actions open PRs needs to be re-enabled by an admin so the next release sweep auto-opens. Until then, this manual fallback per release.

## References

- Release tag: [v1.12.0](https://github.com/Budojo/budojo/releases/tag/v1.12.0)
- Workflow: `.github/workflows/release.yml` § sweep job
- Failed run: https://github.com/Budojo/budojo/actions/runs/25248684327
