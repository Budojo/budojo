# Branch protection — rulesets + Copilot auto-review

## What this covers

Two repository rulesets on `github.com/m-bonanno/budojo` and one GitHub Actions workflow that together:

- Forbid direct commits to `main` and `develop` — everything goes through a pull request
- Require all 8 CI jobs to be green before merge
- Require the PR branch to be up-to-date with its base (strict merge)
- Keep history linear (no merge-commit ziggurats)
- Auto-request **Copilot** as a reviewer the moment a PR is opened — so the author never has to remember it

## Files

| Path                                           | Purpose                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `.github/rulesets/main-protection.json`        | Source of truth for the `main` branch ruleset                         |
| `.github/rulesets/develop-protection.json`     | Source of truth for the `develop` branch ruleset                      |
| `.github/workflows/request-copilot-review.yml` | Workflow that calls `pulls.requestReviewers` on `pull_request.opened` |
| `docs/infra/branch-rulesets.md`                | This file                                                             |

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

## Copilot auto-review workflow

`.github/workflows/request-copilot-review.yml` runs on `pull_request.opened`, `reopened`, and `ready_for_review` (drafts are skipped). It calls `pulls.requestReviewers` via `actions/github-script@v7` with `reviewers: ['Copilot']`. If Copilot is already requested (re-open of an already-pending PR) or the org doesn't have Copilot enabled, the workflow logs a warning and exits without failing the build.

Permissions required: `pull-requests: write` only.

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

## Copilot code review — repo-level setting

The workflow above handles the **reviewer assignment**. The actual review behaviour (how Copilot responds, which rules it applies) is controlled in **Settings → Code & automation → Code review → Copilot Code Review**. Current state:

- `Automatically request Copilot review on pull request` — not enabled; the workflow replaces this toggle with a committed, git-visible trigger
- `Copilot Chat for this repository` — enabled (comments and review actions land)

If GitHub introduces a ruleset-native "require Copilot as reviewer" rule in the future, we can drop the workflow in favour of the ruleset rule. Until then, the workflow is the explicit path.
