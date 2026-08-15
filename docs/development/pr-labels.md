# PR labels

Every PR carries exactly **one type label** at creation, plus optionally a **status label** that moves as the PR progresses.

## Type labels (one per PR)

| Branch prefix | Label              |
| ------------- | ------------------ |
| `feat/*`      | `✨ feature`       |
| `fix/*`       | `🐛 bug fix`       |
| `hotfix/*`    | `🚑 hotfix`        |
| `chore/*`     | `🔧 maintenance`   |
| `ci/*`        | `⚙️ pipeline`      |
| `docs/*`      | `📝 documentation` |
| `refactor/*`  | `♻️ refactor`      |
| `test/*`      | `🧪 testing`       |

Add `💥 breaking change` as a **second** label when the PR contains a `BREAKING CHANGE` footer.

## Status labels (lifecycle)

| Moment                                       | Label               |
| -------------------------------------------- | ------------------- |
| Still being worked on                        | `🚧 wip`            |
| All reviewer comments resolved, ready to merge | `🟢 ready to merge` |
| Waiting on a dependency or decision          | `🔴 blocked`        |

**Lifecycle:** open the PR with the type label only. Switch to `🟢 ready to merge` once CI is green.

## PR Checklist for Claude — every PR must include

1. **Title** — conventional commit format: `type(scope): description`.
2. **Description** — filled template (What / Why / How / optional Notes / optional Out of scope / References / Test plan) in English. The default `.github/PULL_REQUEST_TEMPLATE.md` auto-populates this skeleton on UI-opened PRs.
3. **Assignee** — always assign `m-bonanno` (`gh pr edit <N> --add-assignee m-bonanno`).
4. **Labels** — apply the type label at creation (table above).
5. **Project board** — add the PR, set both the issue and the PR item to `In Progress` via `./.claude/scripts/board-set.sh <N> in-progress`.
6. **No AI attribution — ever** — do NOT add "Generated with Claude Code", "Co-Authored-By: Claude", or any Anthropic / AI text anywhere: PR bodies, commit messages, code comments, docs.

## PR body file convention

Always write the body to a **per-PR file** under `.claude/pr-bodies/<branch-or-pr>.md` and pass it with:

```bash
gh pr create --body-file .claude/pr-bodies/<file>.md
gh pr edit <N> --body-file .claude/pr-bodies/<file>.md
```

Per-PR files (not a single shared `pr-body.md`) so concurrent PRs don't overwrite each other. **Never** use `--body "..."` or a bash heredoc — special characters get mangled.

## PR rules

- No direct commits to `main` or `develop` — ever, not even for hotfixes.
- All feature / fix / chore branches open PRs **exclusively toward `develop`**.
- `develop → main` only via a PR. semantic-release handles tagging automatically.
- **Squash merge** into `develop`. One clean commit per feature.
- **Merge commit** (no squash) from `develop` into `main`. Squash breaks downstream merge bookkeeping.
- Delete the branch after merge.
