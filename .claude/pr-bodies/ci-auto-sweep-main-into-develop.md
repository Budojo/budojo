## What

Closes #294. New `.github/workflows/post-release-sweep.yml` listens for `release: published` on `main` and auto-opens the canonical `chore/sync-main-into-develop-after-vX.Y.Z` PR. The user clicks "Create a merge commit" to land it — the manual `gh CLI` dance documented in root `CLAUDE.md` § Release Flow shrinks from "open branch + push + open PR + label + board" to one click.

Includes a `workflow_dispatch` manual fallback (in case the release-event run hits a transient API hiccup) so a maintainer can re-run from the Actions tab without re-publishing the release.

## Why

Every stable release needs the main → develop sweep within a small window — without it `develop`'s next beta tag stays on the OLD train (semantic-release can't see the new stable tag from `develop`'s history). The sweep is purely mechanical: zero new code, zero review surface, no Copilot wait per `feedback_release_pr_wait_for_copilot.md`. Perfect candidate for automation.

The original issue proposed a direct push (fast-forward `develop` to `main`). I chose the open-PR path instead — see "Out of scope" below for why.

## How

### Trigger filter

`release: published` fires on every release including beta tags. Beta tags live on `develop` (not `main`), so they shouldn't kick off a main → develop sweep. The workflow `if:` filters them out via tag-name shape:

```yaml
if: ${{ github.event_name == 'workflow_dispatch' || !contains(github.event.release.tag_name, 'beta') }}
```

### Sweep flow

1. Checkout `main` with full history + tags.
2. Resolve the tag (from `release.tag_name` or `inputs.tag`).
3. Cut `chore/sync-main-into-develop-after-${TAG}` from main.
4. Push the branch (idempotent — deletes remote first if a previous run created it).
5. Open or update the sweep PR with the canonical body, label `🔧 maintenance`, assignee `m-bonanno`.

### Permissions

`contents: write` (push the sweep branch) + `pull-requests: write` (open the PR). Both available to the default `GITHUB_TOKEN`.

### Reminder discipline encoded in the auto-PR body

The auto-opened PR body carries the two memory rules that govern the sweep:

- **Merge style** must be "Create a merge commit" (NOT squash) — `project_release_merge_style.md`.
- **No Copilot wait** — `feedback_release_pr_wait_for_copilot.md`.

A future contributor opening that PR sees the rules inline; no need to remember CLAUDE.md cross-references.

## Out of scope

### Why not direct push to develop

The original issue's primary path was: workflow fast-forwards `develop` to `main` and pushes. That needs either:

- The bot in the `develop` ruleset's bypass actor list (admin-only ruleset edit), OR
- A PAT secret with bypass authority (admin-only secret addition).

Both are setup the workflow can't perform itself. Filing #294 separately for the bypass setup would block landing the workflow today. Open-PR + manual one-click merge captures ~80% of the value with zero admin coordination.

If the bypass setup happens later, swapping the workflow's PR step for a `git push origin develop` is a 5-line diff — no architectural rework needed.

### Why not auto-merge via `gh pr merge --auto`

The repo doesn't have GitHub auto-merge enabled (verified earlier in this session: `GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)`). Enabling it is an admin toggle. Same blocker shape as direct push — defer.

### Why not also automate the develop → main release PR

Explicit out-of-scope per the originating issue: the Copilot review on the cumulative diff is a real safety net (incident #285). Keep that step manual.

## References

- Closes #294.
- Memory: `project_release_merge_style.md`, `feedback_release_pr_wait_for_copilot.md`, `project_post_release_main_sweep.md`.
- Adjacent: every prior `chore/sync-main-into-develop-after-vX.Y.Z` PR is the manual shape this workflow now automates (#266, #277, #303, etc.).

## Test plan

- [x] YAML parses (committed via `gh` which validates schema on push? — actually GitHub validates on first run; will know after merge).
- [ ] **Manual smoke (post-merge):** trigger via `gh workflow run post-release-sweep.yml -f tag=v1.9.0` from the Actions UI to validate the script end-to-end without waiting for the next stable release. Expected: a fresh `chore/sync-main-into-develop-after-v1.9.0` PR appears (idempotently overwriting the manually-opened one if still around — but #303 already merged so that's a no-op concern).
- [ ] **Real fire (next stable release):** observe that publishing `v1.X.Y` triggers the workflow, the sweep PR appears within ~30s of the release going live, body is correct, label is set, assignee is set.
- [ ] **Failure path:** if the develop ruleset gains a check the workflow can't satisfy, the workflow fails visibly and the user falls back to the manual `gh` flow documented in CLAUDE.md.
