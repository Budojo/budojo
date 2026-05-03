## What

Adds end-to-end automation to the post-release sweep. After this lands, every `develop → main` release ends with the `chore/sync-main-into-develop-after-vX.Y.Z` PR merging itself the moment its CI is green — no manual click, no empty-commit dance to trigger checks.

## Why

You asked: "perché stiamo SEMPRE facendo PR sweep se abbiamo questo step?". The sweep job in `release.yml` opens the PR but stops there — historically I've been:

1. Manually pushing an empty commit to the sweep branch to trigger CI (because PRs created via `GITHUB_TOKEN` don't fire downstream workflows — GitHub's recursion guard)
2. Then manually clicking "Merge" once CI clears

Both steps repeat on every stable release.

This PR replaces both with the supported GitHub pattern: open the PR with a **PAT** (Personal Access Token) instead of `GITHUB_TOKEN`, which sidesteps the recursion guard, then call `gh pr merge --auto` so GitHub merges as soon as required checks pass.

The sweep is alignment-only (memory `feedback_release_pr_wait_for_copilot.md` — "no Copilot wait, no review surface"), so auto-merging on green CI is the documented policy. We're closing the gap between policy and execution.

## How

`.github/workflows/release.yml` § sweep job, three changes:

1. **Token wiring** — both the `actions/checkout` step and the `gh pr create` env block now read `${{ secrets.BUDOJO_BOT_TOKEN || secrets.GITHUB_TOKEN }}`. The fallback keeps the workflow working before the PAT secret is configured (current manual-merge behaviour, zero regression).
2. **Capture the PR number** — the existing create/edit step now writes `steps.pr.outputs.number` for the next step to consume.
3. **New step: "Enable auto-merge on the sweep PR"** — runs `gh pr merge "$PR" --merge --auto`, gated on `HAS_BOT_TOKEN == 'true'` (skipped cleanly when no PAT is configured, since `--auto` would be useless without CI ever firing).

The job's existing `env:` block exposes `HAS_BOT_TOKEN` as a string because GitHub Actions doesn't allow `secrets.X` directly in `if:` expressions (env is the supported workaround).

`CLAUDE.md` § "Auto-sweep main → develop" updated with the new bullet documenting the PAT secret + the auto-merge behaviour.

The auto-generated sweep PR body now carries a one-line note in "Manual follow-up" telling the reader whether the PR will auto-merge (PAT configured) or stays manual (PAT not configured).

## What you need to do once (admin steps)

To activate full automation, **both** of the following are required:

1. **Enable repo-level auto-merge** at *Settings → General → Pull Requests*: tick "**Allow auto-merge**". Without this `gh pr merge --auto` fails with an `enablePullRequestAutoMerge` GraphQL error. The repo did not have this enabled at the time this PR was opened — verify before relying on the automation.
2. **Create a fine-grained PAT** at https://github.com/settings/tokens (or a classic PAT with `repo` scope):
   - Repository access: only `Budojo/budojo`
   - Permissions: **Contents: Read & write**, **Pull requests: Read & write**, **Issues: Read & write** (the last because `gh pr create --label --assignee` goes through the Issues API — Copilot caught this in the first review pass)
   - Expiration: pick a sane horizon (90d / 1y) — when the PAT expires the workflow falls back to manual-merge with a `::warning::`, no breakage
3. **Save the PAT as a repo secret** at *Settings → Secrets and variables → Actions → New repository secret*:
   - Name: `BUDOJO_BOT_TOKEN`
   - Value: the PAT from step 2
4. The next stable release sweep will auto-merge end-to-end.

The auto-merge step is **non-fatal**: if either prerequisite is missing it logs a `::warning::` and exits 0, so the release tag stays published and the sweep PR remains open and mergeable by hand. The fallback path is the same as the pre-PR behaviour — no regression.

## Out of scope

- **Project-board automation** — the sweep PR's "Manual follow-up" still flags `./.claude/scripts/board-set.sh` as a manual step. That script has hardcoded GraphQL IDs and lives outside the workflow on purpose; folding it into the workflow would mean either checking in the IDs as repo data (drift risk) or fetching them dynamically (slower, brittle). Status quo for now.
- **Release PR auto-merge** (the `develop → main` PR itself) — that one DOES need Copilot review per memory `feedback_release_pr_wait_for_copilot.md`, so manual-click is intentional. This PR only changes the sweep, not the release.

## References

- The user question that prompted this — link to your "perché stiamo SEMPRE facendo PR sweep" thread, no formal issue
- Memory `feedback_release_pr_wait_for_copilot.md` — sweep merge-immediately policy
- Memory `project_post_release_main_sweep.md` — why the sweep matters
- GitHub Actions recursion-guard docs: https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow

## Test plan

- [ ] CI green on the PR
- [ ] No regression: with `BUDOJO_BOT_TOKEN` NOT set, the sweep job runs exactly as today (opens PR, no auto-merge step, manual click). Validated by the fallback `||` operator on the token expression.
- [ ] With `BUDOJO_BOT_TOKEN` SET (post-PAT-configuration): the next stable release tags `vX.Y.Z`, opens the sweep PR with bot identity, fires `pr-checks.yml`, and auto-merges to develop the moment 12/12 checks land green. Verifiable on the next release after the PAT is saved.
- [ ] If the PAT becomes invalid or expires, the fallback should kick in cleanly (workflow uses GITHUB_TOKEN, manual-merge resumes). No catastrophic failure.
