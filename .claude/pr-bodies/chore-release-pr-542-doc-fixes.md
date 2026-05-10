## What

Addresses the eight Copilot review comments on release PR **#542 (v2.3.2)**. Doc-only changes across **five user-facing docs** (legal + ops + mobile) plus two `.claude/pr-bodies/` artefact files (this PR's own body + the release PR body); once merged to `develop`, PR #542 auto-includes them and can be re-merged to `main`.

Replies posted on the corresponding Copilot threads on #542 reference the SHA of this PR's merge commit so the review trail closes cleanly.

## Why

The release PR bundles ten merged feature/fix PRs from the v2.3.2 cycle. Copilot reviewed the diff against `main` and surfaced eight issues split between two anti-patterns:

- **Stale state references** (#220, #227 follow-ups have specific issue IDs now: #537 for the cron retention, #538 for the test coverage). The DPA references were claiming privacy-policy.md was "in lavorazione su #219" when the file actually exists.
- **Domain + deploy-flow fabrications**. The TWA runbook and Play Store listing copy used `app.budojo.it` as the production SPA origin. There is no `app.budojo.it`. Per `docs/infra/production-deployment.md`, the production SPA is `https://budojo.it` (+ `www.budojo.it` alias), and Cloudflare Pages builds production from `main` (not develop) with preview deploys disabled. Same anti-pattern as #536's eleven schema fabrications — writing about infra without `grep`-ing the canonical doc.

The plus-one (offboarding-runbook Step 2) is a real correctness concern: the "soft-delete the academy's athletes to silence the reminder cron" workaround has two side effects I'd overlooked (file deletion via `AthleteObserver::deleting()` + soft-deleted athletes being invisible to `ExportUserDataAction`). Reworded to explicitly forbid the shortcut and point at the proper fix (`academies.disabled_at` filter, tracked in the runbook's Documentation collateral list).

## How

Five files, two anti-patterns:

### Schema / state references (4 surfaces)

- **`docs/legal/dpa-template.md` § Riferimenti** — privacy-policy reference rewritten as a proper markdown link matching the format of surrounding bullets, "in lavorazione" qualifier dropped.
- **`docs/legal/dpia-medical-certificates.md` § 4 Retention** — `follow-up #227-a da aprire` → `tracciato in #537 (DPIA #227-a)`.
- **`docs/legal/dpia-medical-certificates.md` § 6 Mitigations table** — R6's "Issue di riferimento" now points at #537. R7's row is restructured: "Mitigazione attuale" enumerates the explicit medical-cert coverage that landed in #539 (Art. 15 ZIP, Art. 17 PurgeAccountAction), marks the mitigation as **Verificato in v2.3.2**, gates re-opening on the A/B decision in § 8.
- **`docs/legal/dpia-medical-certificates.md` § 8.2 TODO** — `#227-a` reference updated to `#537`.

### Domain + deploy-flow (4 surfaces)

- **`docs/mobile/play-store-listing.md`** — every `app.budojo.it` (4 occurrences: full description EN + IT, Privacy URL table EN + IT) replaced with `budojo.it`.
- **`docs/mobile/twa-runbook.md`** — every `app.budojo.it` (4 occurrences: curl verify, bubblewrap manifest URL, Domain prompt, troubleshooting) replaced with `budojo.it`. Plus the assetlinks deploy-flow rewritten across three sections so the operator understands the truth: CF Pages builds from `main` only, a develop merge does NOT flip the live `assetlinks.json`, the change goes live ~2 min after the `develop → main` release PR is merged.

### Correctness fix (1 surface)

- **`docs/operations/academy-offboarding.md` Step 2 § cron suspension** — the "soft-delete athletes to silence cron" shortcut is now explicitly **forbidden** with a paragraph explaining why (file deletion via `AthleteObserver::deleting()` happens BEFORE grace export; soft-deleted athletes are absent from `/me/export`). Replaced with: tolerate one or two reminder cycles during grace export; the proper fix (the `academies.disabled_at` filter on cron query paths) is in the Documentation collateral list at the bottom of the runbook.

## Notes

- **Why this is a docs-only PR with no `Closes` keyword** — the issues this affects (#220 / #227) stay open by design (they have other ACs not closed by these doc edits). The `Closes #534/#527/#529/#538` linkage lives on the original feature PRs they were filed against, not on this clean-up.
- **Bulk replace was safe** — `sed -i 's/app\.budojo\.it/budojo.it/g'` ran only on the two M9 files; the apex `budojo.it` already appears elsewhere in those docs (legal-page links etc.), so the replacement is a strict superset of what was intended.
- **Self-analysis trigger** — same anti-pattern as #536. Saved memory `feedback_grep_schema_before_writing_docs.md` (added during this session) explicitly covers schema; the lesson extends to **infra branches and domain names**. Will widen the memory scope or write a sibling memory if I catch a third occurrence.
- **No code changes** — gates pass without modification (Vitest, Cypress, PHPStan, PEST, lint, prettier, OpenAPI).

## Test plan

- [x] `grep -rn 'app.budojo.it' docs/mobile/` — zero matches after the change (only the v1.yaml example remains as a separate pre-existing concern, out of scope here).
- [x] `grep -n '#227-a\|#227-b\|in lavorazione su #219\|da aprire' docs/legal/` — only the resolved-via-#537/#539 references remain, no stale "to be opened" wording.
- [x] Markdown source still renders — every internal cross-link uses a relative path that resolves from the file's directory.
- [x] No code touched — backend gates (PHPStan / PEST) and frontend gates (lint / Vitest / Prettier / Cypress) all unaffected.
- [ ] CI green on this PR.
- [ ] After merge: PR #542 auto-includes; respond on each of the 8 Copilot threads with the merge SHA + a one-line summary of the fix.
