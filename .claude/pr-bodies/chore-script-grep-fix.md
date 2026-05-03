## What

`bash .claude/scripts/test-client.sh prettier` was dying silently (no error, just empty output / runtime hang from the agent's perspective) on a clean working tree.

Root cause: the prettier line ran

```
npx prettier --write '...' | grep -v unchanged | tail -10
```

with `set -o pipefail` enabled inside the container shell + `set -euo pipefail` at the script level. When *every* file is already formatted, prettier emits only `… (unchanged)` lines, `grep -v unchanged` matches nothing → exits 1 → pipefail propagates → set -e kills the script.

Wrapped the grep in a brace group with `|| [ $? -eq 1 ]` so ONLY the no-match case (exit 1) is promoted to success. Bare `|| true` would also swallow exit 2 (real grep error: bad regex, I/O failure, missing input) — Copilot caught this in review and the brace-group fix preserves the original safety net while still surviving the clean-tree case.

## Why

The script is supposed to be the standard pre-push gate runner; if it dies on the most common case ("nothing changed since last format") it doesn't earn its keep. Discovered while running the gate during Copilot follow-up on #298 — the agent had to fall back to typing `docker exec ...` by hand.

## How

```diff
- run_in_client "npx prettier --write '...' 2>&1 | grep -v unchanged | tail -10"
+ run_in_client "npx prettier --write '...' 2>&1 | { grep -v unchanged || [ \$? -eq 1 ]; } | tail -10"
```

Plus a comment block explaining why ONLY exit 1 is promoted, so future me / agents don't "simplify" it back to `|| true`.

## Tests

- `bash .claude/scripts/test-client.sh prettier` → returns 0 on a clean tree (was: silent death). Verified locally on the chore branch.
- `lint` and `vitest` subcommands of the same script don't go through `grep -v` so they were never affected; left as-is.
- `test-server.sh` doesn't pipe through `grep -v unchanged` either; no change there.

## Out of scope

- The `copilot-replies.sh` idempotency edge cases — separate concern, separate PR if it ever bites.
- Adding a `--quiet` flag that suppresses the "── prettier --write ──" banner. Not worth the complexity for now.

## Test plan

- [x] `bash .claude/scripts/test-client.sh prettier` exits 0 on a clean tree.
- [x] Existing pipefail behavior preserved — a deliberately broken prettier config still fails the gate (manual smoke).
- [x] Real grep failures (exit 2) still propagate — verified by injecting `--invalid-flag` into the grep call locally; gate failed as expected (Copilot review follow-up).

## References

- Found while addressing Copilot review on #298.
- Copilot review on #299 surfaced the `|| true` over-broad-mask issue; tightened to `|| [ $? -eq 1 ]` in c00f079.
