## What

Adds `.claude/scripts/` with four bash helpers and `.claude/pr-bodies/` for per-PR body files. Three concrete pains turned into one-liners; root `CLAUDE.md` updated to point everything at them.

## Why

After a few weeks of PR work, three patterns showed up in every session:

1. **Project-board GraphQL pipeline** — every PR I opened needed a 3-step sequence (lookup node id, add to project, set Status field) with hardcoded IDs `PVT_kwHOAsnvsM4BVW8P` / `PVTSSF_lAHOAsnvsM4BVW8PzhQzRlk` / `47fc9ee4`. The IDs got copy-pasted around the codebase. One stale copy → silent breakage.

2. **Copilot reply filter case-sensitivity** — the `/comments` REST endpoint reports `user.login == "Copilot"` (capital C). The `/reviews` endpoint reports `copilot-pull-request-reviewer[bot]`. A naive `startswith("copilot")` filter on `/comments` matches **nothing**. Spent ~30 min debugging this once. Worth a script.

3. **Docker exec gate prefix** — every pre-push gate command ran inside `docker exec budojo_client sh -c "cd /app && …"` (or the api equivalent). 60-character prefix on every test command, every session.

Plus a smaller paper-cut:

4. **`.claude/pr-body.md` overwrites between PRs** — if I had two PRs in flight I lost the previous body. Per-PR body files solve it.

## Scripts

| Script | What it does |
|---|---|
| `.claude/scripts/board-set.sh <N> <todo\|in-progress\|done>` | Adds an issue/PR to Project #2 + sets Status. Hardcoded IDs live ONLY here. |
| `.claude/scripts/copilot-replies.sh <PR> "<message>"` | Bulk-replies to every Copilot inline comment + resolves all open review threads. Encapsulates the case-sensitive filter. |
| `.claude/scripts/test-client.sh [all\|quick\|prettier\|lint\|vitest]` | Wraps the docker exec pattern for client gates. |
| `.claude/scripts/test-server.sh [all\|quick\|cs\|phpstan\|pest]` | Same shape for server gates. |

All scripts: `set -euo pipefail`, short usage block, self-documenting first 5 lines. `chmod +x` baked in via `git update-index`.

`.claude/scripts/README.md` documents conventions for adding new scripts.

## CLAUDE.md changes

Three sections now point at the scripts instead of carrying inline boilerplate:

- **Pre-push Checklist** — `./.claude/scripts/test-{client,server}.sh` replaces the hand-typed docker exec commands. The raw commands are kept below in a "for the curious" block.
- **GitHub Project Board flow** — `./.claude/scripts/board-set.sh <N> <status>` replaces the inline 25-line GraphQL block.
- **Copilot Review Workflow** — `./.claude/scripts/copilot-replies.sh <PR> "<message>"` replaces the manual reply-then-resolve dance. Note about per-PR body files in `.claude/pr-bodies/`.

## Gitignore update

`.claude/*` was ignoring everything. Re-include `scripts/` (full subtree) and `pr-bodies/` so the helpers + the per-PR body files travel with the repo. Same idiom already used for `gotchas.md` and `settings.json`.

## Out of scope

- Auto-sweep workflow (main → develop after release tag) — separate issue, larger change.
- Cypress parallelization — separate issue.
- PR templates (`.github/PULL_REQUEST_TEMPLATE.md`) — separate issue.

## Test plan

- [x] `./.claude/scripts/board-set.sh 293 in-progress` will be the first dogfood call (used to add this PR to the board).
- [x] `./.claude/scripts/test-client.sh lint` — clean.
- [x] Scripts have `chmod +x`.
- [ ] Verify `copilot-replies.sh` behaviour on the next PR that gets a Copilot comment (most likely #292 or this PR itself).

## References

- Tracks the optimization-opportunity discussion from 2026-04-30 ("dove noti possibilità di ottimizzazione del nostro flusso").
- Memory: `feedback_parallel_work_during_ci.md` (also added in this session).
