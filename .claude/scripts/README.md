# `.claude/scripts/`

Bash helpers that turn high-frequency manual workflows into one-liners. Every script in this folder exists because the equivalent inline command was typed repeatedly across PRs and would silently drift between sessions.

> Run from the repo root so relative paths resolve. Each script is self-documenting at the top.

## Scripts

### `board-set.sh`

Set the project-board status for an issue or PR in budojo's Project #2.

```bash
./.claude/scripts/board-set.sh 287 in-progress
./.claude/scripts/board-set.sh 274 done
./.claude/scripts/board-set.sh 281 todo   # rare — issues default to Todo on creation
```

Encapsulates the 3-step GraphQL pipeline (lookup node id, add to project, set Status field) and the hardcoded `PVT_*` IDs. The IDs live ONLY in this script — anything else referencing them is drift.

### `copilot-replies.sh`

Post the same reply to every open Copilot inline comment on a PR, then resolve all open review threads.

```bash
./.claude/scripts/copilot-replies.sh 289 \
  "Fixed in ee27fb6. Both valid catches: (1) ... (2) ..."
```

Encapsulates the case-sensitive filter gotcha (`/comments` reports `user.login == "Copilot"` capital C; `/reviews` reports `copilot-pull-request-reviewer[bot]`). Idempotent — replies skip threads already replied to, resolves skip already-resolved threads.

**Discipline (memory):** the message MUST cite the fix commit SHA — `Fixed in <short-sha>. <one-sentence-rationale>`. Lazy "Fixed" without a SHA gets called out.

### `test-client.sh` / `test-server.sh`

Wrap the `docker exec <container> sh -c "cd /app && <cmd>"` prefix that wraps every pre-push gate.

```bash
./.claude/scripts/test-client.sh           # all client gates: prettier + lint + vitest
./.claude/scripts/test-client.sh quick     # skip prettier rewrite, just lint + vitest
./.claude/scripts/test-client.sh vitest    # vitest only

./.claude/scripts/test-server.sh           # all server gates: cs-fixer + phpstan + pest
./.claude/scripts/test-server.sh quick     # phpstan + pest, no cs-fixer rewrite
```

Subcommands: `all` (default), `quick` (skip the `--write` formatters), or any individual gate name.

## Conventions for adding a new script

- One concrete pain → one script. If you find yourself writing the same multi-line bash twice in different PRs, it's a script candidate.
- `set -euo pipefail` at the top.
- A short `usage()` block; first 5 lines of the file are the human-readable contract.
- Hardcoded IDs (project, field, container, etc.) live ONLY in scripts here. Reference them from CLAUDE.md by name, not value.
- `chmod +x` on commit so the script runs without `bash` prefix.

## Companion: `.claude/pr-bodies/`

PR bodies live in their own directory now (instead of overwriting a single `.claude/pr-body.md` per PR). Use `.claude/pr-bodies/<branch>.md` or `.claude/pr-bodies/pr-<number>.md` so you can keep multiple PRs in flight without losing history.
