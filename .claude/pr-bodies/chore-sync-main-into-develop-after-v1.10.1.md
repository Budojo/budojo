## What

Sweep branch for tag **v1.10.1**. Brings the release merge commit from `main` (`f2f012f0`) back into `develop` so semantic-release on the next `develop` push reads the right base for the next beta tag.

> **Merge style:** "Create a merge commit" — NOT squash. Squash erases the parent linkage and breaks downstream merge bookkeeping (memory `project_release_merge_style.md`).

> **Copilot wait:** none. Alignment-only — no new code, no review surface (memory `feedback_release_pr_wait_for_copilot.md`).

## Why

Without the sweep, `develop`'s next beta tag stays on the OLD train (semantic-release can't see the new stable tag from `develop`'s history).

## What's in the diff

The release merge commit from `main` (`f2f012f0`) — the v1.10.1 tag commit. No new code; alignment.

## Note: the auto-sweep workflow STILL didn't fire — same `GITHUB_TOKEN` recursion guard

#316 switched the trigger from `release: published` → `push: tags: 'v*.*.*'` on the theory that tag-push events would fire under `GITHUB_TOKEN`. They don't either. GitHub Actions' rule is broader than I thought: **no workflow event created by `GITHUB_TOKEN` triggers another workflow** — `release.published`, `push.tags`, `push.branches` all skip silently when the source token is `GITHUB_TOKEN`. semantic-release publishes via that token, so neither trigger ever fires for it.

Two real solutions, both deferred to a v1.11.x ticket:

1. **PAT for semantic-release** — store a fine-scoped Personal Access Token as a repo secret, configure semantic-release to push tags with it instead of `GITHUB_TOKEN`. Adds a secret-rotation chore but is the cleanest fix.
2. **Sweep step inside the release workflow itself** — add a "Open sweep PR" step to `release.yml` after the semantic-release step. Same workflow run, no cross-workflow trigger needed. Requires the *Allow GitHub Actions to create and approve PRs* repo setting (still — see below) and shares semantic-release's `GITHUB_TOKEN` permissions.

Both come with an additional dependency: the *Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests* toggle must be **on**, or `gh pr create` from any workflow fails (caught on v1.10.0).

This sweep PR was opened manually via `gh pr create` to keep the release flow moving.

## References

- Release tag: [v1.10.1](https://github.com/m-bonanno/budojo/releases/tag/v1.10.1)
- Auto-sweep workflow: `.github/workflows/post-release-sweep.yml`
- Predecessor sweep: #315 (v1.10.0)
- Originating issue: #294
