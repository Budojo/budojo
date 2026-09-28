---
description: Independent review of an open PR, posted on the PR as inline review threads by the pr-reviewer agent. Run it after opening a PR and after every fix round.
argument-hint: '<PR#> [<old-head>..<new-head>] [--deep]'
---

# /review-pr

Launch the **`pr-reviewer`** agent (`.claude/agents/pr-reviewer.md`) on a pull request. It reads the diff against the canon, verifies each finding, and posts them on the PR as review threads, up to 5 per round. The `develop` and `main` rulesets require every thread resolved before a merge, so its findings block the merge until someone answers them, as Copilot's did.

It is **the one required review** (#2020). Run it when the PR opens and after each fix round: it leaves the record on the PR and re-checks its own open threads. `/prereview` before the push is optional, for a large diff where an early read saves a CI round.

## Steps

1. Take the PR number from the arguments. If there is none, use the PR of the current branch: `gh pr view --json number -q .number`.
2. On a fix round, pass the range of the new commits (`<old-head>..<new-head>`) so the agent reviews them first and settles its earlier threads.
3. Dispatch the `pr-reviewer` agent with the PR number, and the range if there is one.
   - **Default: Sonnet.** Most diffs.
   - **With `--deep`, or on a diff that changes a computation engine** (promotion gaps, payments, arrears, the operator's day), security, or data migration, **dispatch it with `model: "opus"`** on the Agent call. That parameter takes precedence over the agent's `model: sonnet` frontmatter. Those rounds found the bugs Sonnet would not have.
4. When it returns, relay its summary: the review URL, the findings, and the threads it resolved or left open. Don't re-post its findings or add yours on top, unless one is plainly wrong; then say why, reply on the thread, and resolve it.
5. Fix the real findings. Then push, and run `/review-pr <N> <old>..<new>` so the agent settles its own threads. A thread you answered with a reason instead of a fix, resolve yourself after replying.

## Notes

- **Cost:** it runs on the owner's plan, like any sub-agent. No API key and no CI job, which is why the paid reviewer was retired (#1234).
- **No AI attribution:** its comments open with a neutral `**Pre-review**` and are posted with the `gh` account, per `CLAUDE.md`.
- **Read-only:** it never checks out a branch or edits a file. The only writes are the review, replies, and resolving its own threads.
