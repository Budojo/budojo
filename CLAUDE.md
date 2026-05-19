# Budojo — Claude Code Guidelines

**Budojo** is a full-stack web application:

- **Server** — REST API on Laravel 13 (PHP 8.4)
- **Client** — SPA on Angular 21 + PrimeNG 21 (Material preset)

Both run in Docker; `.env` at the repo root holds docker-compose config and is injected into the `api` container via `env_file`. Tech versions live in `server/composer.json`, `client/package.json`, and `docker-compose.yml` — read those for the source of truth, not this file.

## How this file is organized

The repo uses a **hierarchical `CLAUDE.md`** layout. Claude Code loads the nearest `CLAUDE.md` and every ancestor up to the root.

| File                                     | Loaded when             | Scope                                                                                                                       |
| ---------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` (this file)                  | Always                  | Cross-cutting behavioural rules — principles, TDD, git/PR/release discipline, documentation discipline                       |
| [`server/CLAUDE.md`](./server/CLAUDE.md) | Working under `server/` | Laravel patterns + **Uncle Bob canon**, PHPStan/CS-Fixer/PEST conventions                                                   |
| [`client/CLAUDE.md`](./client/CLAUDE.md) | Working under `client/` | Angular patterns + **UX canon** (MD3 / Don't Make Me Think / Norman / Laws of UX), Vitest/Cypress conventions               |

**Procedural runbooks** (the _how_, not the _what_) live under [`docs/development/`](./docs/development/README.md):

- [`git-flow.md`](./docs/development/git-flow.md) — branch model, naming, commit format, daily/hotfix flow
- [`release-flow.md`](./docs/development/release-flow.md) — semantic-release cadence, `## Auto-closes` block, auto-sweep, post-release sweep
- [`reviewer-workflow.md`](./docs/development/reviewer-workflow.md) — Claude reviewer pipeline, reply rules, auto-poll loop
- [`pr-labels.md`](./docs/development/pr-labels.md) — type/status labels, PR checklist, PR body conventions

If a rule here and a rule in a sub-file conflict, **the sub-file wins** for that scope. If a rule here and a runbook conflict, **the runbook is the implementation detail** — fix whichever drifted.

---

## Principles (cross-cutting)

Domain-specific elaborations (SOLID-in-Laravel, UX laws) live in the sub-files.

- **SOLID** — single responsibility, open/closed, Liskov, interface segregation, dependency inversion. See [`server/CLAUDE.md`](./server/CLAUDE.md) § Uncle Bob canon for the backend mapping.
- **DRY** — no duplicated logic. Extract shared behaviour into Actions, services, traits, or test helpers. **But:** accidental duplication is not shared knowledge — don't prematurely extract a second-occurrence match if the two sites will evolve independently.
- **KISS** — the simplest thing that could possibly work. Add complexity only when a real requirement demands it. No "future M5 might want this" speculation.
- **Boy Scout Rule** — leave code cleaner than you found it. Touched a file to fix a bug? Rename a variable, delete a dead comment, tighten an overly clever expression — in the same PR. Keep cleanups tightly scoped; a 200-line "also did some cleanup" PR is harder to review than two focused PRs.

### Test-Driven Development (TDD)

**Always write the failing test first, then write the minimum code to make it pass.**

Four test layers are mandatory — all green before a PR is opened:

| Layer            | Stack                      | Scope                                                                         |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **PHP unit**     | PEST 4                     | Isolated classes — Actions, validators, value objects                         |
| **PHP feature**  | PEST 4 + `RefreshDatabase` | Full HTTP round-trips against an in-memory SQLite DB                          |
| **Angular unit** | Vitest 4                   | Components and services in isolation                                          |
| **Angular E2E**  | Cypress 13                 | User flows in a real browser; all API calls intercepted with `cy.intercept()` |

No untested business logic is merged to `develop`.

---

## Git workflow — the essentials

Full details in [`docs/development/git-flow.md`](./docs/development/git-flow.md). The non-negotiables:

- **GitFlow**: `main` ← `develop` ← `feat|fix|chore|…/<issue-number>-<description>`. No direct commits to `main` or `develop`, ever.
- **Conventional commits**, lower-case subject, enforced by commitlint.
- **Squash merge** into `develop`. **Merge commit** (no squash) from `develop` into `main`.
- **Merge `develop` into the feature branch** when it falls behind — no rebase. Squash on merge collapses the history anyway.
- **Always include the issue number** in the branch name — it's the traceability link.
- **`Closes #N`** in every PR body (not `Refs #N` — Refs leaves the issue open).

### Pre-push checklist

Both gate suites run inside Docker via wrappers under `.claude/scripts/`:

```bash
./.claude/scripts/test-server.sh        # cs-fixer + phpstan + pest
./.claude/scripts/test-client.sh        # prettier --write + lint + vitest
```

Subcommands: `all` (default), `quick` (skip `--write` formatters when re-running mid-session), or any individual gate name. Run formatters/fixers **before staging**, static analysis / lint **after staging**. Never rely on CI to catch these.

**Before `git push`, also scan [`.claude/gotchas.md`](.claude/gotchas.md)** — a living checklist of mistakes we've made before. 30-second read vs. a 5-minute reviewer round-trip. When the reviewer flags a new non-typo mistake in review, add a `→` entry to the correct category in the **same PR** that fixes it.

**Optional: `/prereview` before pushing.** Dispatches a fresh sub-agent to read the diff vs `develop` and surface up to 5 actionable issues. ~30 s vs. one CI round-trip. Use on non-trivial diffs; skip for one-line typo fixes.

---

## PR workflow — the essentials

Full checklist + labels + body conventions in [`docs/development/pr-labels.md`](./docs/development/pr-labels.md). The non-negotiables:

1. **Title** — `type(scope): description`, lower-case.
2. **Body** — fill the `What / Why / How / Notes / Out of scope / References / Test plan` template (English). Write the body to a **per-PR file** under `.claude/pr-bodies/<branch-or-pr>.md` and use `--body-file` (never `--body "..."` or a heredoc).
3. **Assignee** — `m-bonanno` on every PR.
4. **Labels** — one type label at creation (per branch prefix); `🟢 ready to merge` once reviewer comments are resolved.
5. **Board** — add the PR and the issue to the [`org-level project number 2`](https://github.com/orgs/Budojo/projects/2) and set both to `In Progress`:
   ```bash
   ./.claude/scripts/board-set.sh <PR-N> in-progress
   ./.claude/scripts/board-set.sh <ISSUE-N> in-progress
   ```
6. **No AI attribution — ever** — no "Generated with Claude Code", "Co-Authored-By: Claude", or any Anthropic / AI text anywhere.

### Claude reviewer flow

Full pipeline in [`docs/development/reviewer-workflow.md`](./docs/development/reviewer-workflow.md). Key rules:

- After every push the local agent enters an **autonomous review-fix loop** without user prompt — `ScheduleWakeup ~90s`, max 3 iterations, then merge when CI green + threads resolved.
- During the loop, **work in parallel on the next branch** — don't sit idle staring at CI.
- Reply to every reviewer comment via `./.claude/scripts/reviewer-replies.sh <PR-N> "Fixed in <sha>. <rationale>."` (idempotent).
- Replies are **English only**, **first-person developer voice**, **always cite the short commit SHA**.
- After fixing, **re-read the PR body** and update anything the fixes changed (counts, paths, commands). Tick Test plan checkboxes verified.
- **Don't re-trigger the review on every push** — the reviewer's first pass is load-bearing; merge after fix-commit-resolve unless the user explicitly asks for a re-review.

---

## Release flow — the essentials

Full mechanics in [`docs/development/release-flow.md`](./docs/development/release-flow.md). Key rules:

- **semantic-release owns versioning entirely.** Do NOT create a `version` field in `package.json`.
- Every squash merge to `develop` → beta tag `vX.Y.Z-beta.N`.
- Every merge commit `develop → main` → stable tag `vX.Y.Z`.
- Version bumps follow Angular preset: `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major. **Compute the version BEFORE writing the user-facing changelog** — scan `main..develop` commits first so the whats-new file + Release entry match what semantic-release will tag.
- **`## Auto-closes` block is mandatory** on every `develop → main` release PR. Without it, leaf issues stay open after merge (GitHub auto-close only fires on the default branch).
- **Every release ships the user-facing changelog** in the same commit history: `docs/changelog/user-facing/vX.Y.Z.md` + prepend to the `releases` array in `client/src/app/features/whats-new/whats-new.component.ts`.
- **Post-release `main → develop` sweep is mandatory** — otherwise develop's next beta tag stays on the old train.
- **Post-release tech-debt + docs sweep is mandatory** — see [release-flow.md § post-release sweep](./docs/development/release-flow.md#post-release-tech-debt--docscode-cleanup-sweep). Empty findings IS a valid outcome.
- **Workflow changes need an immediate release** — any merge to `develop` touching `pr-claude-review.yml` or the reviewer subagent prompt breaks the reviewer on subsequent PRs until shipped to `main`.

---

## Documentation discipline

The repo ships its own domain documentation in `docs/` — it is **source of truth**, not decoration:

```
docs/
├── README.md              # index
├── entities/*.md          # one file per persisted entity (user, academy, athlete, …)
├── api/v1.yaml            # OpenAPI 3.0 contract for /api/v1
├── specs/*.md             # milestone PRDs
├── development/*.md       # procedural runbooks (git, release, reviewer, labels)
├── design/*.md            # design system, mobile audit, brand kit
└── infra/*.md             # production deployment, branch rulesets
```

### When a doc update is REQUIRED in the same PR

Any change to the **observable contract** or **persisted domain shape**:

- **New / altered migration** → update `docs/entities/<entity>.md`.
- **New backed enum case** → update the enum table in the entity doc AND `docs/api/v1.yaml` enum definitions.
- **New / altered API route** (or query param, payload, status code with semantic meaning) → update `docs/api/v1.yaml`.
- **New business rule** expressed in code but not in schema → document under "Business rules" in the entity doc.
- **New milestone kick-off** → drop the PRD in `docs/specs/<milestone>.md` before opening the first implementation PR.

### When a doc update is NOT required

Pure internal refactor, formatting, dependency bumps, test-only additions, CI tweaks, UI copy without domain meaning.

### Enforcement

- **Spectral** lints `docs/api/v1.yaml` in CI (`🔬 OpenAPI Lint` job) — malformed YAML, missing `operationId`, ghost `$ref`, summary-less operations block merge.
- **The reviewer** will reject a PR where code and docs disagree.

---

## Server (Laravel 13) — backend rules

See [`server/CLAUDE.md`](./server/CLAUDE.md) for:

- **Uncle Bob canon** (Clean Code / Architecture / Agile / Coder) — the shared vocabulary for judging backend code, with SOLID expanded and the Active Record caveat
- Server structure conventions (Actions, Controllers, FormRequests, Resources, Observers)
- PHPStan level 9, PHP CS Fixer, PEST 4 conventions
- API conventions (Sanctum, JSON envelope, academy scoping)

## Client (Angular 21 + PrimeNG 21) — frontend rules

See [`client/CLAUDE.md`](./client/CLAUDE.md) for:

- **Design canon** (Material Design 3 / Don't Make Me Think / Norman / Laws of UX) — the shared vocabulary for judging UI decisions
- Client structure conventions (standalone components, OnPush, functional guards/interceptors, signals)
- PrimeNG 21 with the Material preset — theme, components, layout
- Vitest 4 (unit) and Cypress 13 (E2E) conventions

---

## What Claude Should Always Do

Cross-cutting rules. Backend-only rules (Uncle Bob canon, PHP gates, controller discipline) live in [`server/CLAUDE.md`](./server/CLAUDE.md); frontend-only (UX canon, PrimeNG, Angular gates) in [`client/CLAUDE.md`](./client/CLAUDE.md).

1. **Test first across all four layers** — PEST unit/feature, Vitest unit, Cypress E2E — before writing any implementation.
2. **Never commit to `main` or `develop` directly** — cut a branch, open a PR, add it to the board, set `In Progress`.
3. **Always suggest the branch name** (including the issue number) before starting any work.
4. **Use conventional commits**, lower-case subject, in every `git commit`.
5. **Merge `develop` into the feature branch** when it falls behind — no rebase.
6. **Squash merge** PRs into `develop`; merge commit (no squash) into `main`.
7. **Never create a `version` field** in `package.json` — semantic-release owns versioning entirely.
8. **Reply to every reviewer comment** after fixing — English, first-person, cite the short SHA, re-read and update the PR body, then switch label to `🟢 ready to merge`. The auto-poll-and-fix loop in [reviewer-workflow.md](./docs/development/reviewer-workflow.md) runs this without a user prompt.
9. **Never add AI attribution** — no "Generated with Claude Code", "Co-Authored-By: Claude", or similar anywhere.
10. **Keep `docs/` in sync** — every PR that changes a migration, enum, API route, request/response shape, or business rule updates the relevant `docs/entities/` or `docs/api/v1.yaml` in the same commit history. Internal refactors, formatting, dependency bumps are exempt.
11. **Respect the local canon.** Backend → Uncle Bob (`server/CLAUDE.md`). Frontend → UX canon (`client/CLAUDE.md`). A reviewer's citation of a book or law in those canons is a valid critique on its own — push back only with a specific pragmatic reason, never with taste.
12. **Consult the graphify knowledge graph before touching unfamiliar code.** If `graphify-out/graph.json` exists, run `graphify explain "<EntityOrClass>"` or `graphify query "what touches <X>"` **before the first edit** when an issue lands you in an area you haven't worked on recently. ~6k tokens vs. several minutes of grep + risk of missing a caller. The graph auto-refreshes the AST layer on commit/checkout; run `graphify --update` manually only after `docs/`, migrations, or new specs land. Skip for one-line typos, formatting-only PRs, or files edited in the last hour.
