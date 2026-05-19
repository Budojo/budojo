# Post-push reviewer workflow

The post-push reviewer is **Claude**, not GitHub Copilot (replaced in chore #790). The reviewer runs as `.github/workflows/pr-claude-review.yml`, invokes `anthropics/claude-code-action@v1` on Sonnet 4.6, and loads its system prompt from [`.claude/agents/pr-code-reviewer.md`](../../.claude/agents/pr-code-reviewer.md). The same agent body is usable locally via the `Agent` tool (`subagent_type: pr-code-reviewer`).

## Bot identity

Inline + summary comments are posted under `claude[bot]` by default. If the first test PR on this workflow shows a different login (e.g. `github-actions[bot]`), override via `BOT_LOGIN='<login>' ./.claude/scripts/reviewer-replies.sh …` and update the script default in the same commit.

## Workflow scope (`if:` block)

The workflow `if:` block skips `chore/* docs/* ci/*` branches, so the post-push reviewer only fires on `feat/* fix/* hotfix/* refactor/* test/*` branches. For skipped-prefix branches, the auto-poll loop below still runs (just to wait for CI green + merge) but expects no inline reviewer comments.

## Manual reply flow

When the Claude reviewer leaves comments on a PR:

1. **Fetch all comments**: `gh api repos/Budojo/budojo/pulls/<N>/comments`
2. **For each comment**: evaluate, fix if valid, skip with explanation if not applicable.
3. **Commit all fixes in one commit**: `fix(<scope>): address reviewer comments`
4. **Reply + resolve all threads** using the idempotent helper:
   ```bash
   ./.claude/scripts/reviewer-replies.sh <PR-N> "Fixed in <short-sha>. <one-sentence-rationale>."
   ```
   The helper skips threads already replied to and resolves skip already-resolved threads. The reply step uses `gh api /pulls/<N>/comments` filtered on `user.login == BOT_LOGIN`; the resolve step uses a GraphQL `reviewThreads` query filtered on the same login. Human-reviewer threads are untouched.
5. **Re-read the PR body and update it** if the fixes changed anything it describes (counts, paths, commands, structure, examples). A stale PR body misleads reviewers. Per-PR bodies live under `.claude/pr-bodies/<branch-or-pr>.md` so concurrent PRs don't overwrite each other; push with `gh pr edit <N> --body-file <path>`.
6. **Push and switch label to `🟢 ready to merge`.**

### Reply rules (mandatory)

- **English only** — never Italian, regardless of the original comment language.
- **First-person developer voice** — "Fixed the Carbon overflow with a regex pre-check." Never "the user / maintainer says…". The local agent is acting on behalf of the maintainer; the wire shows the maintainer's reply.
- **Always reference the fix commit** — include the short SHA in every reply: `Fixed in abc1234.`
- **One sentence** — what changed + the commit SHA. Reviewers don't need essays.

## Auto-poll-and-fix loop (post-push, no user prompt needed)

After every `git push` that opens or updates a PR, the local agent enters an autonomous review-fix loop **without waiting for the user to ask**. The loop is asynchronous: the agent schedules the wake-up and **moves immediately to the next branch / task**. The loop fires when the wake-up returns; the agent does not sit idle staring at CI.

### Cycle

1. **Immediately after** `gh pr create` / `git push`, schedule a wake-up in ~90 s:
   ```
   ScheduleWakeup delaySeconds=90,
                  prompt="check PR <N> for Claude reviewer comments + CI status"
   ```
2. **On each wake-up**, in parallel:
   - `gh api repos/Budojo/budojo/pulls/<N>/comments` — any inline comments authored by `BOT_LOGIN`?
   - `gh pr view <N> --json comments` — any top-level summary review by `BOT_LOGIN`?
   - `gh pr checks <N>` — workflow status (the review job + the 8 required CI jobs).
3. **If the reviewer has commented**:
   - Evaluate each finding. Fix valid ones in a single `fix(<scope>): address reviewer comments` commit. Push.
   - Run `reviewer-replies.sh <N> "Fixed in <sha>. <rationale>."` (idempotent — safe to re-run).
   - Update PR body Test plan checkboxes via `gh pr view <N> --json body` + edit + `gh pr edit --body-file`.
   - Switch label to `🟢 ready to merge`.
4. **If the reviewer hasn't commented yet, but the review job is still running**: `ScheduleWakeup ~90s` again. Bounded by **max 3 iterations** (~4-5 min total wait). After that, log "reviewer didn't comment, moving on" and stop polling.
5. **Once CI is green AND all reviewer threads are resolved AND label is `🟢 ready to merge`**: merge (squash into develop; merge commit into main). Exception: `develop → main` release PRs wait for explicit user go-ahead.
6. **Don't re-trigger the review on every push.** The reviewer's first pass is the load-bearing one; after fix-commit-resolve, merge without waiting for a second pass unless the user explicitly asks for a re-review.

## Test plan checkboxes — recurring miss

The bash IMMEDIATELY before `gh pr merge` MUST be:

```bash
gh pr view <N> --json body | jq -r '.body' > /tmp/pr-body-<N>.md
# tick verified boxes via sed
sed -i 's/- \[ \] <verified-item>/- [x] <verified-item>/' /tmp/pr-body-<N>.md
gh pr edit <N> --body-file /tmp/pr-body-<N>.md
```

Skipping this leaves the PR body claiming "untested" after merge. **Recurring miss** — flagged in agent memory more than once.
