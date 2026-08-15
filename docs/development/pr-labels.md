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

## `🧊 frozen` — issues only, never PRs

Distinct from `🔴 blocked`, which means *someone should unblock this*. **`🧊 frozen` means parked by decision**: the work is well-specified and not rejected, but it depends on something the current product deliberately does not have.

Today that is almost always a **capability disabled on the desktop build** — `config/budojo.php` maps the `desktop` runtime profile to an empty capability set, so community, athlete accounts, web push, email and the breach check simply do not exist there (#1229). The code was written behind capability flags precisely so this work survives a config flip if a hosted build returns.

Rules:

- A frozen issue **stays open** and keeps its type label. Freezing is not closing — the audit trail and the spec are worth keeping (`#1010` is a real security requirement the moment a second account can exist).
- Freezing carries a **comment naming the specific capability or constraint**, not a generic "parked". A future reader must be able to tell what would have to change for it to thaw.
- **Close instead of freezing** when the work's foundation is gone rather than switched off — the mobile track (#511–#513, #531) needed a hosted origin and a Play Console pipeline, so it was closed with an explanation, not frozen.
- Frozen issues are excluded when judging "what's actually pending" — that is the whole point of the label.

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
