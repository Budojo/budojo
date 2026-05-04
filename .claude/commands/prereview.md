---
description: Pre-push review of the current branch's diff vs develop. Dispatches a fresh sub-agent that reads the diff and surfaces up to 5 actionable issues — bugs, wrong assumptions, missing test coverage, security holes — before Copilot has to flag them on the PR.
argument-hint: '[--base <branch>]'
---

# /prereview

Run a Copilot-style pre-review on the current branch's diff. The goal is to catch the kind of bug Copilot would catch on the PR, but BEFORE the push so we save a CI round-trip.

## Steps

1. Determine the base branch. Default to `develop`. If the user passed `--base main` use that instead.
2. Run `git fetch origin <base>` and capture the diff with `git diff origin/<base>...HEAD --stat` (overview) and `git diff origin/<base>...HEAD` (full).
3. If the diff is empty, report "no changes vs <base>, nothing to review" and stop.
4. Dispatch the **`general-purpose`** sub-agent with this brief:

   > **Pre-review of a feature branch — find real issues only, max 5 points.**
   >
   > Below is the full diff vs `origin/<base>`. Read it as a code reviewer with no prior conversation context. Focus on:
   >
   > - **Bugs**: logic errors, off-by-one, race conditions, missing null checks, wrong API usage. Confirm by tracing the code path.
   > - **Wrong assumptions**: comments / docstrings / variable names that don't match what the code does (the kind of thing that bites future maintainers).
   > - **Missing test coverage** for a non-obvious branch.
   > - **Security / correctness**: SQL injection, XSS, auth bypass, missing input validation at trust boundaries, secret leakage in logs / commit messages / fixtures.
   > - **Convention drift**: violations of `CLAUDE.md` / `server/CLAUDE.md` / `client/CLAUDE.md` rules that are explicitly listed in those files (Uncle Bob backend canon, MD3 / Norman / Krug frontend canon, i18n parity, doc-discipline lock-step).
   >
   > Skip:
   >
   > - Style nits (prettier / lint already gate on these).
   > - Subjective preferences ("I'd name this differently").
   > - Theoretical concerns without a concrete trace through the code.
   >
   > **Output format**: max 5 numbered points. Each one has:
   >
   > - `**File:line**` — anchor.
   > - One sentence describing the issue.
   > - One sentence proposing the fix.
   >
   > If you find fewer than 5 real issues, report fewer. If you find none, say "no issues found, ship it." Be honest — false positives are worse than misses for this workflow.

5. Pass the diff (full output of `git diff origin/<base>...HEAD`) and the diff stat as the prompt body, plus the `--base` value if the user passed one.
6. When the agent returns, summarise its output back to the user in a tight bullet list. Don't add my own commentary on top of the agent's findings unless they're flat wrong — in which case explain why.
7. If the agent flags real issues, ask the user whether to address them inline before pushing or open a follow-up.

## Notes

- The agent is `general-purpose` (not `code-reviewer`) because it doesn't need write access — pure read + reasoning.
- Don't run automated fixes from this command. The user decides whether each finding warrants a code change before push.
- Cost: this is one agent dispatch per push. Worth it because the alternative is the full Copilot CI round-trip (3-5 min vs ~30 s for the agent).
