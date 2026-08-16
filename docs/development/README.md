# Budojo — Development runbooks

This folder is the **procedural** counterpart to the **behavioural** rules in `CLAUDE.md`. CLAUDE.md tells you _what_ to do; these files tell you _how_, step by step, with the exact commands.

The split exists so CLAUDE.md stays loadable in agent context (every session pays its size in tokens) while the verbose how-to lives somewhere a human or agent can `Read` on demand.

## Files

| File | Covers |
|---|---|
| [`linux-dev.md`](./linux-dev.md) | The Linux development base: prerequisites, one-time setup, bind-mount file ownership, the SELinux verdict, the Cypress recipe, what is still Windows-only |
| [`git-flow.md`](./git-flow.md) | Branch model (GitFlow), branch naming, commit-message format, daily TDD cycle, hotfix flow |
| [`release-flow.md`](./release-flow.md) | semantic-release beta/stable cadence, `## Auto-closes` block construction, auto-sweep main → develop, user-facing changelog discipline, post-release tech-debt sweep |
| [`pr-labels.md`](./pr-labels.md) | Type label per branch prefix, status labels lifecycle, board status moves |
| [`visual-verification.md`](./visual-verification.md) | Mandatory in-browser smoke before push for visible UI changes; the `cypress/included` screenshot recipe + the dev-server / login-redirect traps |

## When to update

A runbook update is required in the same PR whenever:

- A new `.claude/scripts/` helper changes the pipeline (board, reviewer replies, gates)
- A GitHub Actions workflow changes the release / review / sweep flow
- A new branch type / commit type / label is added
- A discipline rule (e.g. `## Auto-closes` block) changes semantics
- The local visual-verification recipe changes (Cypress image version, dev-server / redirect quirks)
- The dev environment gains a platform-specific behaviour (container uid mapping, bind-mount ownership, a target that only works on one OS)

If you change CLAUDE.md to mention a step, check whether the runbook here is the source of truth and keep both in lock-step (CLAUDE.md links here; the link must not rot).
