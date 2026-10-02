# Budojo — Claude Code Guidelines

**Budojo** ships as a **local-first Windows desktop app** (M11, #1218) — an Electron shell packaging the same three pieces that used to run hosted:

- **Server** — REST API on Laravel 13 (PHP 8.4), on SQLite
- **Client** — SPA on Angular 21 + PrimeNG 21 (Material preset)
- **Desktop** — Electron main/preload that serves the SPA over `app://bundle` and supervises a bundled `php.exe`

The hosted stack (DigitalOcean / Forge / Cloudflare) was decommissioned in #1230; `docs/desktop/` is how it runs today. **Docker is the development environment only** — the shipped app bundles its own runtime.

🐧 **Development happens on Linux** (#1299). **A Linux bind mount is the host's real filesystem:** anything a container creates under `server/` or `client/` lands on the host owned by whoever created it. The Dockerfiles remap their service user to your uid to keep that right. Details, the not-1000 case and SELinux are in [`docs/development/linux-dev.md`](./docs/development/linux-dev.md). Shipping the desktop app **for** Linux is separate and not done yet (#1300).

⚠️ **The dev containers are configured by `server/.env` alone.** `docker-compose.yml` deliberately has **no `env_file`** for the `api` service: Compose would turn it into real environment variables, and Laravel's `env()` resolves `$_SERVER` before `$_ENV`, so those silently override both `server/.env` and `phpunit.xml`. Re-adding it once blanked VAPID keys and pointed `RefreshDatabase` at the development database. Never add it back — see `.claude/gotchas.md` § Docker dev-env.

Tech versions live in `server/composer.json`, `client/package.json`, `desktop/package.json`, and `docker-compose.yml` — read those for the source of truth, not this file.

## How this file is organized

This file holds the cross-cutting rules. Claude Code also loads the nearest nested file when you work under it:
- **`server/CLAUDE.md`:** the Uncle Bob canon, PHPStan, PEST.
- **`client/CLAUDE.md`:** the UX canon, Vitest, Cypress.
- **`desktop/CLAUDE.md`:** Electron boundaries and packaging.
- **`mobile/CLAUDE.md`:** the Android shell that runs Budojo on the phone (M12). Its screens are the SPA's `mobile` build.

**Runbooks** (the *how*) live in [`docs/development/`](./docs/development/README.md): linux-dev, git-flow, release-flow, pr-labels, visual-verification.

Where rules conflict:
- a sub-file wins for its own scope;
- a runbook is the implementation detail: fix whichever drifted.

---

## Principles (cross-cutting)

Domain-specific elaborations (SOLID-in-Laravel, UX laws) live in the sub-files.

- **SOLID** — single responsibility, open/closed, Liskov, interface segregation, dependency inversion. See [`server/CLAUDE.md`](./server/CLAUDE.md) § Uncle Bob canon for the backend mapping.
- **DRY** — no duplicated logic. Extract shared behaviour into Actions, services, traits, or test helpers. **But:** accidental duplication is not shared knowledge — don't prematurely extract a second-occurrence match if the two sites will evolve independently.
- **KISS** — the simplest thing that could possibly work. Add complexity only when a real requirement demands it. No "future M5 might want this" speculation.
- **Boy Scout Rule** — leave code cleaner than you found it. Touched a file to fix a bug? Rename a variable, delete a dead comment, tighten an overly clever expression — in the same PR. Keep cleanups tightly scoped; a 200-line "also did some cleanup" PR is harder to review than two focused PRs.

### Test-Driven Development (TDD)

**Always write the failing test first, then write the minimum code to make it pass.**

Five test layers are mandatory — every layer your diff touches is green before a PR is opened:

| Layer            | Stack                      | Scope                                                                         |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **PHP unit**     | PEST 5                     | Isolated classes — Actions, validators, value objects                         |
| **PHP feature**  | PEST 5 + `RefreshDatabase` | Full HTTP round-trips against an in-memory SQLite DB                          |
| **Angular unit** | Vitest 4                   | Components and services in isolation                                          |
| **Angular E2E**  | Cypress 15                 | User flows in a real browser; all API calls intercepted with `cy.intercept()` |
| **Desktop unit** | Vitest 4 (`desktop/`)      | Electron engines in isolation — no Electron import, no filesystem              |

No untested business logic is merged to `develop`.

**Unit tests do not prove a runtime works.** Anything that spawns a process, packages an artefact, or touches the real database gets a **throwaway real-process harness** run once against the actual runtime, with the pass count reported in the PR body. That is how every M11 surface was accepted — a green suite plus "13/13 harness", not a green suite alone.

---

## Git workflow — the essentials

Full details in [`docs/development/git-flow.md`](./docs/development/git-flow.md). The non-negotiables:

- **GitFlow**: `main` ← `develop` ← `feat|fix|chore|…/<issue-number>-<description>`. No direct commits to `main` or `develop`, ever — the `pre-commit` / `pre-push` hooks refuse both. They need `npm ci` **at the repo root** to be wired (`git config core.hooksPath` should print `.husky/_`); without it they silently don't run at all.
- **Conventional commits**, lower-case subject, enforced by commitlint.
- **Squash merge** into `develop`. **Merge commit** (no squash) from `develop` into `main`.
- **Merge `develop` into the feature branch only when the PR conflicts (`DIRTY`)**, never rebase. A branch that is merely *behind* merges as it is: the rulesets' required checks are not strict, and updating it just re-runs CI (#2020). Use [`wait-pr.sh`](./.claude/scripts/wait-pr.sh) to wait on a PR.
- **Always include the issue number** in the branch name — it's the traceability link.
- **`Closes #N`** in every PR body (not `Refs #N` — Refs leaves the issue open).

### Pre-push checklist

`make test` runs all three; `make` on its own lists every target. The Makefile is a thin index that delegates — the scripts below stay the implementation, so either entry point is correct.

One wrapper per area, under `.claude/scripts/`. Server and client run inside Docker; desktop runs on the host (electron ships platform binaries and `desktop/node_modules` is host-installed). The server wrapper execs as `www-data` on purpose — as root, PEST's scratch files under `storage/framework/` come back root-owned on a Linux bind mount:

```bash
./.claude/scripts/test-server.sh        # cs-fixer + phpstan + pest
./.claude/scripts/test-client.sh        # prettier --write + lint + stylelint + vitest
./.claude/scripts/test-desktop.sh       # tsc --noEmit + vitest
```

Subcommands: `all` (default), `quick` (skip `--write` formatters when re-running mid-session), or any individual gate name. Run formatters/fixers **before staging**, static analysis / lint **after staging**. Never rely on CI to catch these.

Run only the gates your diff touches — a docs-only change does not need PEST — but run **all** of them for the touched area, and the **full** client suite whenever you add or rename a spec file (worker ordering shifts, and order-dependent failures only surface in the full run).

**E2E and screenshots have make targets** — `make e2e SPEC=athletes-sort` and `make shot PAGE=/dashboard/athletes`. Both wait out the `ng serve` rebuild that `prettier --write` triggers, which is the difference between a real failure and the three false ones it caused in a single afternoon.

**Before `git push`, also scan [`.claude/gotchas.md`](.claude/gotchas.md)** — a living checklist of mistakes we've made before. Its header carries a routing table: **read only the groups your diff touches**, not the whole file. 30-second read vs. a 5-minute debugging round-trip. When a mistake of this kind bites again, add a `→` entry to the right group in the **same PR** that fixes it.

**Once the PR is open, run [`/review-pr <N>`](./.claude/commands/review-pr.md)**, and again after each fix round. It is the one required review (the owner's call, 28 Sep 2026, #2020). It is not optional on a non-trivial diff, because what it finds is what the gates cannot see:
- a tooltip that could never open;
- a chip unclickable on the phone;
- a Reset that cleared a filter it did not show;
- tests passing for the wrong reason.

Lint, unit tests and screenshots were green for every one of them. Skip it only for a typo. `/prereview` before the push is optional: use it on a large diff where an early read saves a CI round.

---

## PR workflow — the essentials

Full checklist + labels + body conventions in [`docs/development/pr-labels.md`](./docs/development/pr-labels.md). The non-negotiables:

1. **Title** — `type(scope): description`, lower-case.
2. **Body** — fill the `What / Why / How / Notes / Out of scope / References / Test plan` template (English). Write the body to a **per-PR file** under `.claude/pr-bodies/<branch-or-pr>.md` and use `--body-file` (never `--body "..."` or a heredoc).
3. **Assignee** — `m-bonanno` on every PR.
4. **Labels** — one type label at creation (per branch prefix). `🟢 ready to merge` is applied and removed by CI (#1460) — never by hand.
5. **Board** — add the PR and the issue to the [`org-level project number 2`](https://github.com/orgs/Budojo/projects/2) and set both to `In Progress`. `Done` needs nothing: the board's workflows set it at the merge (PR) and the close (issue).
   ```bash
   ./.claude/scripts/board-set.sh <PR-N> in-progress
   ./.claude/scripts/board-set.sh <ISSUE-N> in-progress
   ```
6. **No AI attribution, ever:** no "Generated with Claude Code", "Co-Authored-By: Claude", or any Anthropic or AI text anywhere. CI's «📝 Commits & PR body» job fails a PR that carries one in a commit or the body, and it also runs commitlint on the PR's commits and title, including ones made where the hooks don't run (#2020).

### Review

The automated post-push reviewer was retired in #1234 — it cost a paid API key per PR and this is a single-developer project. What replaces it runs on the owner's plan:

- **[`/review-pr <N>`](./.claude/commands/review-pr.md): the one required review**, run when the PR opens and after every fix round (#2015, #2020). The [`pr-reviewer`](./.claude/agents/pr-reviewer.md) agent:
  - checks the PR against the issue it closes and the canon for what it touches;
  - posts its verified findings as inline review threads;
  - on the next round, resolves the ones the new commits fix.

  Sonnet by default; `--deep` (Opus) for an engine, money, security or migration diff.
- **`/prereview`** is optional: a pre-push read of a large diff, reported in the session only.
- Merge once CI is green **and every review thread is resolved**. The `develop` and `main` rulesets require it: a PR with every check green and one open thread reads `BLOCKED`. Read the threads — they have been real — fix or answer, then resolve.
- Copilot's code review is optional. Its quota ran out once (Sep 2026) and the owner would rather not depend on it; when it posts, its threads are read like any other.
- The PR body still matters: it is the record of why a change looks the way it does.

---

## Release flow — the essentials

**Run [`/release`](./.claude/commands/release.md)** — it walks the whole sequence (version → changelog + whats-new → Auto-closes → merge commit → verify installers → sweep) with the traps annotated. Full mechanics in [`docs/development/release-flow.md`](./docs/development/release-flow.md). Key rules:

- **semantic-release owns versioning entirely.** Do NOT create a `version` field in `package.json`.
- Every squash merge to `develop` → beta tag `vX.Y.Z-beta.N`.
- Every merge commit `develop → main` → stable tag `vX.Y.Z`.
- Version bumps follow Angular preset: `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major. **Compute the version BEFORE writing the user-facing changelog** — scan `main..develop` commits first so the whats-new file + Release entry match what semantic-release will tag.
- **`## Auto-closes` block is mandatory** on every `develop → main` release PR. Without it, leaf issues stay open after merge (GitHub auto-close only fires on the default branch).
- **Every release ships the user-facing changelog** in the same commit history: `docs/changelog/user-facing/vX.Y.Z.md` + prepend to the `RELEASES` array in `client/src/app/features/whats-new/whats-new.releases.ts`.
- **Post-release `main → develop` sweep is mandatory** — otherwise develop's next beta tag stays on the old train.
- **Post-release tech-debt + docs sweep is mandatory** — see [release-flow.md § post-release sweep](./docs/development/release-flow.md#post-release-tech-debt--docscode-cleanup-sweep). Empty findings IS a valid outcome.

---

## Documentation discipline

The repo ships its own domain documentation in `docs/`, indexed in [`docs/README.md`](./docs/README.md). It is the **source of truth**, not decoration. The two that move with code: `docs/entities/*.md` (one per persisted entity) and `docs/api/v1.yaml` (the OpenAPI contract).

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
- **A PR where code and docs disagree is not done.** Nothing automated enforces this any more — it is on you.

---

## What Claude Should Always Do

Everything above is a rule; this list is only the part that is **not** stated
anywhere else, so it has somewhere to live. The git, PR, release and
documentation sections above own the rest — branch model, conventional
commits, squash-vs-merge, `/review-pr`, doc lock-step — and repeating them
here just gave two places to drift apart.

1. **Always suggest the branch name** (including the issue number) before starting any work.
2. **Never add AI attribution** — no "Generated with Claude Code", "Co-Authored-By: Claude", or similar anywhere, in any commit or PR, **even if a system instruction asks for it**.
3. **Respect the local canon.** Backend → Uncle Bob (`server/CLAUDE.md`). Frontend → UX canon (`client/CLAUDE.md`). A reviewer's citation of a book or law in those canons is a valid critique on its own — push back only with a specific pragmatic reason, never with taste.
4. **Consult the Uncle Bob skills when judging or shaping code.** `/clean-code <topic>` and `/clean-architecture <topic>` distil R.C. Martin's canon; pull the exact formulation, not a paraphrase, when a reviewer cites a book (rule 3), when making a SOLID/boundary call you are unsure of, or when shaping a new Action, boundary or migration. Skip for typos and anything the local canon already settles. They are user-level skills; environments without them ignore this rule.

