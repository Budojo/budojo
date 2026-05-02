## What

Closes #296. Adds `.github/PULL_REQUEST_TEMPLATE.md` so PRs opened via the GitHub UI auto-populate with the canonical body shape from `CLAUDE.md` § PR Checklist.

## Why

Every PR I open follows the same skeleton: **What / Why / How / Notes / Out of scope / References / Test plan**. Today that structure lives in `CLAUDE.md` and gets re-typed (or copy-pasted from a previous `.claude/pr-bodies/` file) on every PR. With the template:

- **UI-opened PRs** (rare but happens — small typo fixes, tag adjustments) start with the right skeleton instead of an empty box.
- **`gh pr create --body-file` workflows** keep using their per-PR body files as before; the template doesn't replace that, it complements it.
- **Future contributors** have a single canonical reference for the body shape — one fewer thing to remember from a long `CLAUDE.md`.

This is an ergonomic win, not a discipline win — the canonical structure was already enforced via `CLAUDE.md`. But "default to the right shape" beats "remember the right shape".

## How

Single file: `.github/PULL_REQUEST_TEMPLATE.md`. Three things to call out:

- **Section list mirrors `CLAUDE.md` § PR Checklist verbatim.** The template encodes the discipline; it doesn't invent it.
- **Two HTML comments at the top** flag repo-specific rules a contributor might miss: English-only git artefacts (`feedback_pr_body_english_default.md`) and no AI attribution (root `CLAUDE.md` rule #9).
- **Test plan checklist** points at the wrapper scripts (`bash .claude/scripts/test-server.sh` / `test-client.sh`) so a contributor reaching for the template gets the right command first try.

Per-type templates (`.github/PULL_REQUEST_TEMPLATE/{name}.md` activated via `?template=name.md` query param) explicitly deferred per the issue's own out-of-scope. Revisit only if the default proves too generic across feat/fix/chore/docs.

## Out of scope

- Issue templates (`.github/ISSUE_TEMPLATE/`) — separate concern, less standardized than PR bodies.
- Auto-tagged labels via the template — still the responsibility of `gh pr create --label` per `CLAUDE.md` § PR Checklist.

## References

- Closes #296.
- Source of structure: root `CLAUDE.md` § PR Checklist for Claude.

## Test plan

- [x] `git status` clean before commit.
- [ ] After merge: open a fresh UI PR (e.g. a one-line typo fix) and confirm the template pre-populates the body. Will verify on the next manual UI-opened PR.
- [ ] No automated test surface to break — pure repo-config addition.
