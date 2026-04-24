# Branch protection — rulesets + Copilot auto-review

## What this covers

Two repository rulesets on `github.com/m-bonanno/budojo` that together:

- Forbid direct commits to `main` and `develop` — everything goes through a pull request
- Require all 8 CI jobs to be green before merge
- Require the PR branch to be up-to-date with its base (strict merge)
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
- `required_status_checks` with `strict_required_status_checks_policy: true` and all 8 contexts listed:
  - `🔬 PHPStan (level 9)`
  - `🧪 PEST Tests`
  - `🎨 PHP CS Fixer (dry-run)`
  - `🧪 Angular Tests (Vitest)`
  - `🔍 Angular Lint (ESLint)`
  - `✨ Angular Format (Prettier)`
  - `🎭 Cypress E2E`
  - `🔬 OpenAPI Lint (Spectral)`
- `required_linear_history`
- `non_fast_forward` (no force-push)
- `deletion` forbidden (branch cannot be deleted)
- `creation` forbidden (branch cannot be recreated via push once deleted)

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

The JSON files in `.github/rulesets/` are the source of truth. They were applied to the repo via:

```bash
gh api -X POST repos/m-bonanno/budojo/rulesets --input .github/rulesets/main-protection.json
gh api -X POST repos/m-bonanno/budojo/rulesets --input .github/rulesets/develop-protection.json
```

To re-apply after a manual UI edit (or to review drift), pull the current state and diff against the files:

```bash
gh api repos/m-bonanno/budojo/rulesets --jq '.[].id' | while read id; do
  gh api repos/m-bonanno/budojo/rulesets/$id
done
```

If drift appears, decide which side to trust and either re-apply from the file or update the file to match the UI state. **Never let UI state silently diverge from the JSON** — that defeats the reproducibility goal.

## Emergency bypass (hotfix without PR)

When a genuine production emergency requires committing directly to `main` or `develop`:

1. Go to **Settings → Rules → Rulesets** in the GitHub UI
2. Click the relevant ruleset (`main-protection` or `develop-protection`)
3. Change **Enforcement status** from `Active` to `Evaluate` or `Disabled`
4. Push the hotfix directly
5. Change **Enforcement status** back to `Active`

Every change to the ruleset enforcement is logged in the repo's audit log. Don't leave it disabled.

Preferred alternative: open a PR anyway, mark it `hotfix`, and merge as soon as CI passes — the PR path is almost always fast enough and leaves a better paper trail.

## Relationship with legacy branch protection

`gh api repos/m-bonanno/budojo/branches/{main,develop}/protection` still returns branch-protection rules from before rulesets were introduced. They overlap with the ruleset but are **less strict** (their `required_status_checks.contexts: []` meant no CI was actually required — the gap this PR closes). The two systems coexist and the **most restrictive wins**.

**Follow-up**: after a few merges confirm the new rulesets behave correctly, remove the legacy branch protection to avoid two overlapping sources of truth. Do it in its own tiny PR with a link to this doc so the decision trail is clear.
