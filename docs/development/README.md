# Budojo — Development runbooks

This folder is the **procedural** counterpart to the **behavioural** rules in `CLAUDE.md`. CLAUDE.md tells you _what_ to do; these files tell you _how_, step by step, with the exact commands.

The split exists so CLAUDE.md stays loadable in agent context (every session pays its size in tokens) while the verbose how-to lives somewhere a human or agent can `Read` on demand.

## Files

| File | Covers |
|---|---|
| [`git-flow.md`](./git-flow.md) | Branch model (GitFlow), branch naming, commit-message format, daily TDD cycle, hotfix flow |
| [`release-flow.md`](./release-flow.md) | semantic-release beta/stable cadence, `## Auto-closes` block construction, auto-sweep main → develop, user-facing changelog discipline, post-release tech-debt sweep |
| [`reviewer-workflow.md`](./reviewer-workflow.md) | Post-push Claude reviewer pipeline: comment fetch, fix commit, `reviewer-replies.sh` usage, auto-poll-and-fix loop, reply rules |
| [`pr-labels.md`](./pr-labels.md) | Type label per branch prefix, status labels lifecycle, board status moves |

## When to update

A runbook update is required in the same PR whenever:

- A new `.claude/scripts/` helper changes the pipeline (board, reviewer replies, gates)
- A GitHub Actions workflow changes the release / review / sweep flow
- A new branch type / commit type / label is added
- A discipline rule (e.g. `## Auto-closes` block) changes semantics

If you change CLAUDE.md to mention a step, check whether the runbook here is the source of truth and keep both in lock-step (CLAUDE.md links here; the link must not rot).
