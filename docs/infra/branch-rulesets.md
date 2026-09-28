# Branch protection — rulesets + Copilot auto-review

## What this covers

Two repository rulesets on `github.com/Budojo/budojo` that together:

- Forbid direct commits to `main` and `develop` — everything goes through a pull request
- Require all 9 CI jobs to be green before merge (`main` also requires «Whats-new pin matches expected release», 10 in all)
- Do **not** require the PR branch to be up to date with its base. A branch behind develop merges as it is, and only a conflict (`DIRTY`) needs develop merged in. This is the live setting, checked 28 Sep 2026; these files said `true` until #2020.
- Keep history linear (no merge-commit ziggurats)

Plus a documented recipe for **Copilot auto-review**, which is a repo-level toggle (not a workflow) because GitHub's REST API silently ignores requests to add Copilot as a reviewer via `pulls.requestReviewers`.

## Files

| Path                                       | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `.github/rulesets/main-protection.json`    | Source of truth for the `main` branch ruleset    |
| `.github/rulesets/develop-protection.json` | Source of truth for the `develop` branch ruleset |
| `docs/infra/branch-rulesets.md`            | This file                                        |

## Enforcement details

Both rulesets target a single branch each and carry identical rules with one delta:

- **`main`** allows `squash` **or** `merge` as the merge method — for cherry-picking future hotfixes from develop
- **`develop`** allows `squash` only — matches the canonical history we want

All other rules are identical:

- `pull_request` required, with `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`, `required_approving_review_count: 0` (single-dev repo — GitHub forbids self-approval, so the count stays at 0 until there are collaborators who can approve)
- `required_status_checks` with `strict_required_status_checks_policy: false` (see above) and all 9 contexts listed:
  - `🔬 PHPStan (level 9)`
  - `🧪 PEST Tests`
  - `🎨 PHP CS Fixer (dry-run)`
  - `🧪 Angular Tests (Vitest)`
  - `🔍 Angular Lint (ESLint)`
  - `✨ Angular Format (Prettier)`
  - `🎭 Cypress E2E`
  - `🔬 OpenAPI Lint (Spectral)`
  - `📝 Commits & PR body` (since #2021: commitlint on a develop PR's commits and title, and no AI attribution in any PR's commits or body)
- `required_linear_history`
- `non_fast_forward` (no force-push)
- `deletion` forbidden (branch cannot be deleted)
- `creation` forbidden (protected branch cannot be created via push — belt-and-suspenders alongside the `deletion` rule so the history can't be rewritten by deleting the ruleset first and pushing a new branch with the same name)

**No bypass actors.** Even the repo owner goes through a PR. Emergency bypass is one UI click away (see below).

## Copilot auto-review — enable in repo Settings, not via workflow

GitHub exposes Copilot code review as a **repo-level toggle** in the web UI, not as something the standard `pulls.requestReviewers` REST API can populate:

- The REST API responds **200 OK** to `POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` with `reviewers: ["Copilot"]`, but silently drops the reviewer — the request is never persisted.
- Passing the bot login `copilot-pull-request-reviewer` instead returns **422 "Reviews may only be requested from collaborators"** — Copilot is not a collaborator in the API sense.
- The UI button ("Request review from Copilot") uses an internal path that is not publicly documented.

Given that, the correct recipe is:

1. Go to **Settings → Code & automation → Code review → Copilot Code Review**
2. Enable **`Automatically request Copilot code review on pull request`**
3. Save

After that, every new PR (opened or re-opened, drafts skipped) gets Copilot assigned automatically, and Copilot begins reviewing within ~1–3 minutes. No workflow required; no GitHub App to install; the trigger is managed by GitHub and logged in the audit log.

If GitHub ever ships a first-class API endpoint for assigning Copilot programmatically (or a ruleset rule of type `required_reviewer: copilot`), swap this recipe for the committed version at that point.

## Applying / re-applying the rulesets

The JSON files in `.github/rulesets/` are the source of truth. **First-time creation** uses `POST`:

```bash
# One-shot: only when the ruleset does not exist yet on the repo.
gh api -X POST repos/Budojo/budojo/rulesets --input .github/rulesets/main-protection.json
gh api -X POST repos/Budojo/budojo/rulesets --input .github/rulesets/develop-protection.json
```

**Updates to an existing ruleset MUST use `PUT`** (replace) or `PATCH` (partial) targeting the ruleset ID — `POST` would silently create a duplicate instead of replacing, leaving overlapping rulesets that compose in confusing ways:

```bash
# 1. Find the current ruleset IDs
gh api repos/Budojo/budojo/rulesets --jq '.[] | {id, name}'
# -> e.g. { "id": 15504731, "name": "main-protection" }
# -> e.g. { "id": 15504735, "name": "develop-protection" }

# 2. Replace the ruleset body from the JSON file (PUT = full replace)
gh api -X PUT repos/Budojo/budojo/rulesets/15504731 --input .github/rulesets/main-protection.json
gh api -X PUT repos/Budojo/budojo/rulesets/15504735 --input .github/rulesets/develop-protection.json
```

To **review drift** (current live state vs JSON in repo), dump each ruleset and diff:

```bash
gh api repos/Budojo/budojo/rulesets --jq '.[].id' | while read id; do
  gh api repos/Budojo/budojo/rulesets/$id > "/tmp/ruleset-$id.json"
  echo "Dumped ruleset $id to /tmp/ruleset-$id.json"
done
# Then manual compare against .github/rulesets/*.json
```

If drift appears, decide which side to trust: either re-apply from the file via `PUT` (JSON wins), or update the file to match the UI state (UI wins). **Never let UI state silently diverge from the JSON** — that defeats the reproducibility goal.

**Accidental duplicate?** If a `POST` was run on an already-existing ruleset, you'll see two rulesets with the same name in `gh api repos/.../rulesets`. Delete the newer one:

```bash
gh api -X DELETE repos/Budojo/budojo/rulesets/{newer-id}
```

## Emergency bypass (hotfix without PR)

When a genuine production emergency requires committing directly to `main` or `develop`:

1. Go to **Settings → Rules → Rulesets** in the GitHub UI
2. Click the relevant ruleset (`main-protection` or `develop-protection`)
3. Change **Enforcement status** from `Active` to `Evaluate` or `Disabled`
4. Push the hotfix directly
5. Change **Enforcement status** back to `Active`

Every change to the ruleset enforcement is logged in the repo's audit log. Don't leave it disabled.

Preferred alternative: open a PR anyway, mark it `hotfix`, and merge as soon as CI passes — the PR path is almost always fast enough and leaves a better paper trail.

## Legacy branch protection: removed

**Before 28 Sep 2026:** the rulesets coexisted with the branch-protection rules from before them, and the most restrictive of the two won.
- **`develop`'s legacy protection** added nothing: its `strict: true` had no required context to apply to.
- **`main`'s legacy protection held the one check the ruleset did not:** «Whats-new pin matches expected release».

**The owner's cleanup (#2022):**
1. That check was added to `main-protection`, and only there: the job runs only on PRs into `main`, so on `develop` it would never report and would block every PR.
2. Both legacy rules were deleted.

The rulesets are now the only source of truth: `gh api repos/Budojo/budojo/branches/{main,develop}/protection` answers «Branch not protected». Required checks:
- **`develop`:** 9 contexts.
- **`main`:** the same 9 plus the whats-new pin.
