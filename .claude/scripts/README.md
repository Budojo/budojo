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

### `test-client.sh` / `test-server.sh` / `test-desktop.sh`

One wrapper per area — the pre-push gates, without retyping the container prefix.

```bash
./.claude/scripts/test-client.sh           # all client gates: prettier + lint + vitest
./.claude/scripts/test-client.sh quick     # skip prettier rewrite, just lint + vitest
./.claude/scripts/test-client.sh vitest    # vitest only

./.claude/scripts/test-server.sh           # all server gates: cs-fixer + phpstan + pest
./.claude/scripts/test-server.sh quick     # phpstan + pest, no cs-fixer rewrite

./.claude/scripts/test-desktop.sh          # all desktop gates: tsc --noEmit + vitest
./.claude/scripts/test-desktop.sh build    # compile main + preload into dist/
```

Subcommands: `all` (default), `quick` (skip the `--write` formatters — client/server only), or any individual gate name.

`test-client.sh` and `test-server.sh` wrap `docker exec <container> sh -c "cd /app && <cmd>"`. **`test-desktop.sh` runs on the host** — electron and electron-builder ship platform binaries, `desktop/node_modules` is installed natively, and the shipped app contains no Docker at all. It deliberately excludes `build:renderer`, which needs the client's container-installed toolchain.

## Conventions for adding a new script

- One concrete pain → one script. If you find yourself writing the same multi-line bash twice in different PRs, it's a script candidate.
- `set -euo pipefail` at the top.
- A short `usage()` block; first 5 lines of the file are the human-readable contract.
- Hardcoded IDs (project, field, container, etc.) live ONLY in scripts here. Reference them from CLAUDE.md by name, not value.
- `chmod +x` on commit so the script runs without `bash` prefix.

## Companion: `.claude/pr-bodies/`

PR bodies live in their own directory (instead of overwriting a single `.claude/pr-body.md` per PR). Use `.claude/pr-bodies/<branch>.md` or `.claude/pr-bodies/pr-<number>.md` so several PRs can be in flight at once without overwriting each other.

They are **scratch, not an archive** — once the PR is open GitHub holds the canonical copy, so delete yours after the merge. See [`.claude/pr-bodies/README.md`](../pr-bodies/README.md) for the prune one-liner and why the pile was cleared in #1269.
