## What

Sweep branch for tag **v1.10.0**. Brings the release merge commit from `main` back into `develop` so semantic-release on the next `develop` push reads the right base for the next beta tag.

> **Merge style:** "Create a merge commit" — NOT squash. Squash erases the parent linkage and breaks downstream merge bookkeeping (memory `project_release_merge_style.md`).

> **Copilot wait:** none. Alignment-only — no new code, no review surface (memory `feedback_release_pr_wait_for_copilot.md`).

## Why

Without the sweep, `develop`'s next beta tag stays on the OLD train (semantic-release can't see the new stable tag from `develop`'s history).

## What's in the diff

The release merge commit from `main` (`2339b00d`) — the v1.10.0 tag commit. No new code; this is alignment.

## Manual follow-up

- Add to project board with `./.claude/scripts/board-set.sh <PR-N> in-progress` — the sweep workflow does not do this today (project-board GraphQL needs hardcoded IDs that live in the helper script, not in the workflow).

## Note: first production run of the auto-sweep workflow (#309)

The workflow that opened this PR automatically failed for two reasons that are tracked into the v1.10.1 patch:

1. **`release.published` doesn't fire downstream workflows when semantic-release uses `GITHUB_TOKEN`** — known GitHub Actions safeguard against recursive workflow firing. Switching the trigger to `push: tags: 'v[0-9]+.[0-9]+.[0-9]+'` fires regardless of token type.
2. **`GitHub Actions is not permitted to create or approve pull requests`** — repo-level setting at *Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests*. Needs a one-time toggle by an admin.
3. **Indented heredoc** — the body in the workflow is indented for YAML readability, which would render the whole PR body as a markdown code block. Caught by Copilot on the v1.10.0 release PR (#314).

This sweep PR was opened manually via `gh pr create` to keep the release flow moving; the v1.10.1 patch will land all three workflow fixes.

## References

- Release tag: [v1.10.0](https://github.com/m-bonanno/budojo/releases/tag/v1.10.0)
- Workflow: `.github/workflows/post-release-sweep.yml`
- Originating issue: #294
