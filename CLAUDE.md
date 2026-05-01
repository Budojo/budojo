# Budojo — Claude Code Guidelines

## Project Overview

**Budojo** is a full-stack web application with a decoupled architecture:

- **Server** — REST API built with Laravel 13 (PHP), served via Docker
- **Client** — SPA built with Angular 21 + PrimeNG 21, served via Docker

The two containers communicate over a shared Docker network. A `.env` file at the repo root holds the configuration for docker-compose and is injected into the `api` container via `env_file`.

## How this file is organized

The repo uses a **hierarchical `CLAUDE.md`** layout. When Claude Code works inside a subdirectory it automatically loads the nearest `CLAUDE.md` and every ancestor up to the root. So:

| File                                     | Loaded when             | Scope                                                                                                                       |
| ---------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` (this file)                  | Always                  | Cross-cutting rules — git, PRs, Copilot review, docs discipline, CI, TDD, release flow                                      |
| [`server/CLAUDE.md`](./server/CLAUDE.md) | Working under `server/` | Laravel patterns + **Uncle Bob canon** (Clean Code / Architecture / Agile / Coder), PHPStan/CS-Fixer/PEST conventions       |
| [`client/CLAUDE.md`](./client/CLAUDE.md) | Working under `client/` | Angular patterns + **UX canon** (Material Design 3 / Don't Make Me Think / Norman / Laws of UX), Vitest/Cypress conventions |

If a rule here and a rule in a sub-file conflict, **the sub-file wins** for that scope.

---

## Principles (cross-cutting)

Every principle below applies across the stack. Domain-specific elaborations (SOLID-in-Laravel, UX laws) live in the sub-files.

- **SOLID** — single responsibility, open/closed, Liskov, interface segregation, dependency inversion. Each letter has a concrete obligation; see [`server/CLAUDE.md`](./server/CLAUDE.md) § Uncle Bob canon for the backend mapping.
- **DRY** — no duplicated logic. Extract shared behaviour into Actions, services, traits, or test helpers. **But:** duplication that looks accidental is different from shared knowledge — don't prematurely extract a second-occurrence match if the two sites will evolve independently.
- **KISS** — the simplest thing that could possibly work. Add complexity only when a real requirement demands it. If a future M5 email reminder "might" want something, don't build it today.
- **Boy Scout Rule** — leave the code cleaner than you found it. Touched a file to fix a bug? Rename an unclear variable, delete a dead comment, tighten an overly clever expression in the same PR. But keep these changes tightly scoped — a 200-line PR that "also does some cleanup" is harder to review than two focused PRs.

### Test-Driven Development (TDD)

**Always write the failing test first, then write the minimum code to make it pass.**

Four test layers are mandatory — all must be green before a PR is opened:

| Layer            | Stack                      | Scope                                                                         |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **PHP unit**     | PEST 4                     | Isolated classes — Actions, validators, value objects                         |
| **PHP feature**  | PEST 4 + `RefreshDatabase` | Full HTTP round-trips against an in-memory SQLite DB                          |
| **Angular unit** | Vitest 4                   | Components and services in isolation                                          |
| **Angular E2E**  | Cypress 13                 | User flows in a real browser; all API calls intercepted with `cy.intercept()` |

**TDD cycle:**

```
Write failing PEST spec       →  implement PHP code        →  all PEST tests green
Write failing Vitest spec     →  implement Angular code    →  all Vitest tests green
Write failing Cypress spec    →  verify navigation/flows   →  all Cypress tests green
```

No untested business logic is merged to `develop`.

---

## Tech Stack

| Layer                | Technology              | Version              |
| -------------------- | ----------------------- | -------------------- |
| Server framework     | Laravel                 | 13                   |
| Database             | MySQL                   | 8.4 LTS              |
| PHP static analysis  | PHPStan                 | 2 (level 9)          |
| PHP code style       | PHP CS Fixer            | 3                    |
| PHP test runner      | PEST                    | 4                    |
| Client framework     | Angular                 | 21                   |
| UI component library | PrimeNG                 | 21 (Material preset) |
| Design philosophy    | Material Design 3       | —                    |
| Angular unit tests   | Vitest                  | 4                    |
| Angular E2E tests    | Cypress                 | 13                   |
| API contract         | OpenAPI                 | 3.0.3                |
| OpenAPI linter       | Spectral                | 6                    |
| Containerization     | Docker + Docker Compose | latest               |
| Release automation   | semantic-release        | 24                   |
| Commit enforcement   | Husky 9 + commitlint    | —                    |

---

## Git Workflow

### Branch Model (GitFlow)

```
main
 └── develop
      ├── feat/13-academy-setup
      ├── feat/16-athletes-list
      ├── fix/22-login-validation-error
      └── ...
```

| Branch       | Purpose                                                                           | Merge target       |
| ------------ | --------------------------------------------------------------------------------- | ------------------ |
| `main`       | Production-ready code only. Every merge creates a stable tag.                     | —                  |
| `develop`    | Integration branch. All features land here first. Every merge creates a beta tag. | `main` (via PR)    |
| `feat/*`     | New features. Cut from `develop`, merged back via PR.                             | `develop`          |
| `fix/*`      | Bug fixes on develop flow.                                                        | `develop`          |
| `hotfix/*`   | Urgent production fixes. Cut from `main`.                                         | `main` + `develop` |
| `chore/*`    | Tooling, deps, CI, Docker — no business logic.                                    | `develop`          |
| `refactor/*` | Code restructuring with no behaviour change.                                      | `develop`          |
| `docs/*`     | Documentation only.                                                               | `develop`          |
| `test/*`     | Test-only additions or fixes.                                                     | `develop`          |
| `ci/*`       | CI/CD pipeline changes.                                                           | `develop`          |

### Daily Development Flow

```bash
# 1. Always start from an up-to-date develop
git checkout develop && git pull origin develop

# 2. Cut a feature branch (include issue number)
git checkout -b feat/16-athletes-list

# 3. TDD cycle: test → implement → refactor (small atomic commits)
git commit -m "test(athletes): add pest feature test for list endpoint"
git commit -m "feat(athletes): implement athlete list with belt/status filters"
git commit -m "test(e2e): add cypress spec for athletes page navigation"

# 4. Keep the branch up to date with develop (merge develop in, no rebase)
git fetch origin && git merge origin/develop

# 5. Open PR → develop when all tests pass
```

### Pre-push Checklist — run before every `git push`

The dev stack is Docker-only on this machine; both gate suites have to run
inside their containers. Wrappers live under [`.claude/scripts/`](.claude/scripts/README.md):

```bash
# Whenever PHP files changed:
./.claude/scripts/test-server.sh        # cs-fixer + phpstan + pest

# Whenever Angular files changed:
./.claude/scripts/test-client.sh        # prettier --write + lint + vitest
```

Subcommands available: `all` (default), `quick` (skip the `--write` formatters
when re-running mid-session), or any individual gate name (`pest`, `phpstan`,
`vitest`, `lint`, etc.). Each script prints what it ran and tails the output —
read it for failures, don't trust silent exit codes.

The raw commands the wrappers run, for the curious or the script-skipping:

```bash
docker exec budojo_api sh -c "cd /var/www/api && vendor/bin/php-cs-fixer fix"
docker exec budojo_api sh -c "cd /var/www/api && vendor/bin/phpstan analyse --no-progress --memory-limit=1G"
docker exec budojo_api sh -c "cd /var/www/api && vendor/bin/pest --parallel"

docker exec budojo_client sh -c "cd /app && npx prettier --write 'src/**/*.{ts,html,scss}' cypress"
docker exec budojo_client sh -c "cd /app && npm run lint"
docker exec budojo_client sh -c "cd /app && npm test -- --watch=false"
```

> Cypress E2E tests require `ng serve` running — they are validated in CI.
> Run `npm run cy:open` locally (`docker exec -it budojo_client …`) to debug a specific E2E spec.

> Run formatters/fixers **before staging** so the fixed files are included in the commit.
> Run static analysis / lint **after staging** to verify the final state.
> Never rely on CI to catch these — fix locally first.

**Before the `git push`, also scan [`.claude/gotchas.md`](.claude/gotchas.md)** — a living checklist of mistakes we've made before. 30-second read vs. a 5-minute Copilot round-trip later. When Copilot flags a new non-typo mistake in review, add a `→` entry to the correct category in the SAME PR that fixes it. The file grows naturally and every future PR benefits.

### Branch Naming

```
<type>/<issue-number>-<short-description-in-kebab-case>
```

Examples:

- `feat/13-academy-setup`
- `feat/16-athletes-list`
- `fix/22-login-validation-error`
- `hotfix/31-token-expiry-crash`
- `test/25-e2e-cypress`

Always include the **issue number** — it creates a traceable link between branch, PR, and the board item.

**Types:** `feat`, `fix`, `hotfix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`

### Commit Messages (Angular Conventional Commits)

```
<type>(<scope>): <short description in imperative mood, lower-case>

[optional body — explain WHY, not what]

[optional footer: BREAKING CHANGE: ..., closes #issue]
```

Examples:

- `feat(auth): add jwt refresh token endpoint`
- `fix(athletes): handle duplicate email on create`
- `test(auth): add pest feature test for login flow`
- `test(e2e): add cypress spec for setup redirect guard`
- `chore(docker): add production build script`
- `refactor(athletes): extract list logic into a dedicated action`

> Commitlint enforces this format locally via Husky. The **subject must be lower-case**.

### GitHub Project Board — PO workflow

The board lives at [`github.com/orgs/Budojo/projects/2`](https://github.com/orgs/Budojo/projects/2) (Project #2 under the `Budojo` org). It tracks **both issues and their open PRs** — issues are the primary items; PRs are added alongside them so the connection is visible directly on the board.

> **Post-org-transfer note:** the repo originally lived under `m-bonanno/budojo` (user account) and the project board was Project #2 under that user. When the repo moved to the `Budojo` org, the full project (structure + all 250 items + their statuses) was migrated via `copyProjectV2` + a one-shot bulk import script, and now lives as Project #2 under the org. Old user-owned project URLs continue to work via GitHub's redirect; the source project on `m-bonanno` was archived to avoid drift.

#### Issue + PR lifecycle on the board

| Status        | When                                                           |
| ------------- | -------------------------------------------------------------- |
| `Todo`        | Issue created                                                  |
| `In Progress` | PR opened (set on both the issue item AND the PR item)         |
| `Done`        | PR merged → GitHub auto-closes issue → both items move to Done |

#### Standard flow — step by step

1. **Create issue** → it lands on the repo. Note: GitHub does NOT auto-add to the project, so call `board-set.sh <N> todo` (or rely on the rest of the pipeline below to add it when the PR opens).
2. **Cut branch** named `<type>/<issue-number>-<description>`.
3. **Open PR** with `Closes #N` in the body.
4. **Move issue + PR to In Progress on the board** — the [`board-set.sh`](.claude/scripts/board-set.sh) helper encapsulates the 3-step GraphQL pipeline (lookup node id, add to project, set Status field):
   ```bash
   ./.claude/scripts/board-set.sh <PR-N> in-progress
   ./.claude/scripts/board-set.sh <ISSUE-N> in-progress
   ```
   Acceptable status arguments: `todo`, `in-progress`, `done`. Hardcoded project / field / option IDs live ONLY in the script — anywhere else referencing them is drift.
5. **When the PR is merged**, GitHub auto-closes the linked issue and both items move to `Done` automatically (no script call needed).

#### Rules

1. **Branch names include the issue number** — this is the traceability link.
2. **Every PR body must contain `Closes #N`** (or `Fixes #N`) for each issue it resolves.
3. **Always add the PR to the project board** right after opening it.
4. **Assign `m-bonanno`** and apply the correct type label on every PR.

#### Finding a project item ID

```bash
gh project item-list 1 --owner Budojo --format json
```

### PR Rules

- **No direct commits to `main` or `develop`** — ever, not even for hotfixes.
- All feature/fix/chore branches open PRs **exclusively toward `develop`**.
- `develop` → `main` only via a PR (semantic-release handles tagging automatically).
- **Squash merge only** into `develop`. One clean commit per feature.
- **Merge commit** (no squash) from `develop` into `main`.
- Delete the branch after merge.

### PR Checklist for Claude — every PR must include

1. **Title** — conventional commit format: `type(scope): description`
2. **Description** — filled template (What / Why / How / optional Notes / optional Out of scope / References / Test plan) in English. The default `.github/PULL_REQUEST_TEMPLATE.md` auto-populates this skeleton on UI-opened PRs.
3. **Assignee** — always assign `m-bonanno` (`gh pr edit <N> --add-assignee m-bonanno`)
4. **Labels** — apply the type label at creation (see table below).
5. **Project board** — add the PR, set to `In Progress`.
6. **No AI attribution — ever** — do NOT add "Generated with Claude Code", "Co-Authored-By: Claude", or any Anthropic/AI text anywhere: PR bodies, commit messages, code comments, docs.

> **PR body formatting:** Always write the body to `.claude/pr-body.md` and pass it with
> `gh pr create --body-file .claude/pr-body.md` or `gh pr edit <N> --body-file .claude/pr-body.md`.
> Never use `--body "..."` or a bash heredoc — special characters get mangled.

#### Type labels (one per PR)

| Branch prefix | Label              |
| ------------- | ------------------ |
| `feat/*`      | `✨ feature`       |
| `fix/*`       | `🐛 bug fix`       |
| `hotfix/*`    | `🚑 hotfix`        |
| `chore/*`     | `🔧 maintenance`   |
| `ci/*`        | `⚙️ pipeline`      |
| `docs/*`      | `📝 documentation` |
| `refactor/*`  | `♻️ refactor`      |
| `test/*`      | `🧪 testing`       |

Add `💥 breaking change` as a second label when the PR contains a `BREAKING CHANGE` footer.

#### Status labels

| Moment                                       | Label               |
| -------------------------------------------- | ------------------- |
| Still being worked on                        | `🚧 wip`            |
| All review comments resolved, ready to merge | `🟢 ready to merge` |
| Waiting on a dependency or decision          | `🔴 blocked`        |

Open with the type label only. Switch to `🟢 ready to merge` once all Copilot comments are addressed.

### Release Flow (automated via semantic-release)

Versioning, changelogs, and Git tags are fully automated — no manual tagging or version bumps ever.

**Beta release** — every squash merge to `develop`:

1. semantic-release reads conventional commits since the last tag
2. Determines the next version bump (`fix` → patch, `feat` → minor, `BREAKING CHANGE` → major)
3. Creates tag `vX.Y.Z-beta.N` + a GitHub pre-release whose body IS the rendered changelog

**Stable release** — every merge commit from `develop` → `main`:

1. semantic-release reads conventional commits since the last stable tag
2. Creates tag `vX.Y.Z` + GitHub Release whose body carries the full changelog

The changelog is **not** checked back into the repo — there is no `CHANGELOG.md` to maintain. The GitHub Releases page is the source of truth. We dropped the `@semantic-release/changelog` + `@semantic-release/git` plugins after the develop branch ruleset rejected the bot's auto-commit (see `.claude/gotchas.md` § GitHub Actions).

**Config:** `.releaserc.json` at the repo root.

- Do not create a `version` field in `package.json` — semantic-release owns versioning.
- `package-lock.json` is committed; always run `npm install` after changing `package.json`.

**Repo setting prerequisite for the auto-sweep workflow** (`.github/workflows/post-release-sweep.yml`):

- *Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"* must be **enabled**. Without it, `gh pr create` from the workflow fails with `GitHub Actions is not permitted to create or approve pull requests`. Caught on the v1.10.0 release; one-time admin toggle.
- The workflow triggers on `push: tags: 'v*.*.*'` (with `'!v*-beta*'` exclusion), NOT `release: published`. semantic-release publishes via `GITHUB_TOKEN`, which by GitHub Actions design refuses to fire downstream `release.published` workflows (recursion guard). Tag pushes DO fire under the same token.

#### User-facing changelog (#254)

Separately from the semantic-release dev changelog above, the SPA ships a **user-facing changelog** at `/dashboard/whats-new` written in plain English for non-technical customers. Two artefacts kept in lock-step by hand:

- `docs/changelog/user-facing/v{X.Y.Z}.md` — markdown source, one file per stable release, light emoji on section headings.
- The `releases` array in `client/src/app/features/whats-new/whats-new.component.ts` — typed `Release[]` rendered via Angular template (no markdown parser dependency).

**Discipline:** every `develop → main` release PR adds the markdown file AND prepends the array entry in the same commit history. The vitest spec pinning the version order in the array (`renders all four backfilled releases`) fails when one is missing — that's the regression-catching trip-wire, by design.

### Post-release tech-debt + docs/code cleanup sweep

After every stable release — that is: release PR (`develop → main`) merged, semantic-release tag published on `main`, AND the post-release `main → develop` sync PR merged (the one that brings the merge commit back into `develop` so semantic-release reads the right base on the next push) — open a `chore/techdebt-sweep-v{X.Y.Z}` branch from `develop` and run the canonical checklist:

- **Code-level**: triage every `TODO` / `FIXME` / `XXX` / `HACK`, every `@ts-expect-error` / `@ts-ignore` / `eslint-disable`, every stray `console.log` / `console.debug`, every `.skip` / `.only` / `.todo` test marker. `npm outdated` (under `client/`) + `composer outdated` (under `server/`). Walk `client/src/app/app.routes.ts` for dead routes.
- **Docs-level**: `docs/entities/*.md` against migrations since last tag, `docs/api/v1.yaml` against controller / resource / form-request changes, `docs/design/DESIGN_SYSTEM.md` against `client/src/styles/budojo-theme.scss`, `client/CLAUDE.md` + `server/CLAUDE.md` + root `CLAUDE.md` for stale file paths / route names, `.claude/gotchas.md` for stale rules, every `README.md` for stale quick-start commands.
- **Agent-memory-level**: the agent maintains a memory index file in its own memory directory (NOT in this repo) — the sweep makes sure the index reflects every memory file present, and each memory `description` accurately summarises its content. See `feedback_post_release_techdebt_sweep.md` (also agent-side) for the full inventory.
- **Project-board**: stale issues (>90d no activity), umbrella issues carry honest current-state snapshots.

The sweep is **not optional**, but finding nothing IS a valid outcome — an empty sweep that documents "checked everything, nothing to do" is a successful sweep. Squash-merge to develop; chore commits don't bump version. Findings that require real code change beyond hygiene (real bugs, missing tests, doc rewrites) get their own follow-up issue and a stub pointer in the sweep PR.

Full checklist + rationale: `feedback_post_release_techdebt_sweep.md` in the agent's memory directory (outside this repo).

### Hotfix Flow

```bash
# 1. Cut from main, not develop
git checkout main && git pull origin main
git checkout -b hotfix/31-token-expiry-crash

# 2. Write test, fix, commit
git commit -m "fix(auth): prevent crash on expired token decode"

# 3. PR → main (semantic-release tags automatically)
# 4. Backport: second PR → develop to keep branches in sync
```

### Copilot Review Workflow

When Copilot leaves review comments on a PR:

1. Fetch all comments: `gh api repos/Budojo/budojo/pulls/<N>/comments`
2. For each comment: evaluate, fix if valid, skip with explanation if not applicable
3. Commit all fixes in one commit: `fix(<scope>): address copilot review comments`
4. Reply to every thread + resolve them with the [`copilot-replies.sh`](.claude/scripts/copilot-replies.sh) helper:
   ```bash
   ./.claude/scripts/copilot-replies.sh <PR-N> "Fixed in <short-sha>. <one-sentence-rationale>."
   ```
   Encapsulates the case-sensitive filter gotcha (the `/comments` endpoint reports `user.login == "Copilot"` capital C, while `/reviews` reports `copilot-pull-request-reviewer[bot]` — a naive `startswith("copilot")` filter on `/comments` matches nothing). Idempotent.
5. **Re-read the PR body and update it if the fixes changed anything it describes** (counts, paths, commands, structure, examples). A stale PR body misleads reviewers. Per-PR bodies live under `.claude/pr-bodies/<branch-or-pr>.md` so concurrent PRs don't overwrite each other; push with `gh pr edit <N> --body-file <path>`.
6. Push and switch label to `🟢 ready to merge`.

**Reply rules (mandatory):**

- **Always write in English** — never Italian, regardless of the comment language.
- **Always reference the fix commit** — include the short SHA in every reply: `Fixed in abc1234.`
- Keep replies concise: one sentence on what changed + the commit SHA.

---

## Server (Laravel 13) — backend rules

See [`server/CLAUDE.md`](./server/CLAUDE.md) for:

- **Uncle Bob canon** — Clean Code / Clean Architecture / Clean Agile / The Clean Coder — the full shared vocabulary for judging backend code, with SOLID expanded and the Active Record caveat
- Server structure conventions (Actions, Controllers, FormRequests, Resources, Observers)
- PHPStan level 9, PHP CS Fixer, PEST 4 conventions
- API conventions (Sanctum, JSON envelope, academy scoping)
- Backend-specific "What Claude Should Always Do"

---

## Client (Angular 21 + PrimeNG 21) — frontend rules

See [`client/CLAUDE.md`](./client/CLAUDE.md) for:

- **Design canon** — Material Design 3 / Don't Make Me Think / Design of Everyday Things / Laws of UX — the shared vocabulary for judging UI decisions
- Client structure conventions (standalone components, OnPush, functional guards/interceptors, signals)
- PrimeNG 21 with the Material preset — theme, components, layout
- Vitest 4 (unit) and Cypress 13 (E2E) conventions
- Frontend-specific "What Claude Should Always Do"

---

## Documentation discipline

The repo ships its own domain documentation in `docs/` — it is **source of truth**, not decoration:

```
docs/
├── README.md              # index
├── entities/*.md          # one file per persisted entity (user, academy, athlete, …)
├── api/
│   ├── README.md          # how to view the spec (Swagger UI, Redocly)
│   └── v1.yaml            # OpenAPI 3.0 contract for /api/v1
└── specs/*.md             # milestone PRDs (M3 etc.)
```

### When a doc update is REQUIRED in the same PR

Any change that alters the **observable contract** or **persisted domain shape** demands a matching doc update, delivered in the same PR:

- **New or altered migration** — new table, new column with domain meaning, changed constraint, new index → update `docs/entities/<entity>.md` (or create it for a new entity)
- **New backed enum case or value** (e.g. adding `Red` to `Belt`) → update the enum table in the relevant entity doc AND update `docs/api/v1.yaml` enum definitions
- **New or altered API route** — new endpoint, new query param, changed request/response shape, new status code with semantic meaning → update `docs/api/v1.yaml`
- **New business rule expressed in code but not in schema** (e.g. new academy-scoping rule, new soft-delete semantics) → document under "Business rules" in the relevant entity doc
- **New milestone kick-off** → drop the PRD in `docs/specs/<milestone>.md` before opening the first implementation PR

### When a doc update is NOT required

- Pure internal refactor (rename a private method, extract a helper, move a file without changing its public API)
- Code formatting, dependency bumps, test-only additions, CI tweaks
- Copy changes in UI that don't correspond to a domain concept

### Enforcement

- **Spectral** lints `docs/api/v1.yaml` in CI (`🔬 OpenAPI Lint` job) — malformed YAML, missing `operationId`, `$ref` typos, and summary-less operations block merge
- **Claude's rule #16** below — any PR you open must include the docs delta in the same commit history when the rule above triggers; do not defer to "later"
- **Reviewer duty** — a reviewer should reject a PR where code and docs disagree

---

## Docker

### Services

| Container       | Purpose                 | Port |
| --------------- | ----------------------- | ---- |
| `budojo_api`    | Laravel PHP-FPM + Nginx | 8000 |
| `budojo_client` | Angular dev server      | 4200 |
| `budojo_db`     | MySQL 8.4               | 3306 |

### Useful commands

```bash
# Start full stack
docker compose up --build

# Generate APP_KEY (required on first run if APP_KEY is empty)
docker exec budojo_api php artisan key:generate

# Run migrations manually
docker exec budojo_api php artisan migrate

# Seed test data (requires LOCAL_ADMIN_PASSWORD set in .env)
docker exec budojo_api php artisan db:seed

# Angular shell
docker exec -it budojo_client sh

# PHP shell
docker exec -it budojo_api sh
```

All secrets via `.env` at the repo root (never committed). Copy `.env.example` to start.

---

## CI/CD (GitHub Actions)

### On every PR to `develop` — `.github/workflows/pr-checks.yml`

All 8 checks must pass before merge:

| Job              | Tool                         | What it checks                                                                      |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `phpstan`        | PHPStan level 9              | PHP static analysis                                                                 |
| `pest`           | PEST 4 (parallel + coverage) | PHP unit + feature tests                                                            |
| `php-cs-fixer`   | PHP CS Fixer (dry-run)       | PHP code style                                                                      |
| `angular-test`   | Vitest 4                     | Angular unit tests                                                                  |
| `angular-lint`   | ESLint                       | Angular TypeScript/template lint                                                    |
| `angular-format` | Prettier                     | Angular code formatting                                                             |
| `cypress-e2e`    | Cypress 13 (Chrome headless) | Angular E2E flows                                                                   |
| `openapi-lint`   | Spectral 6                   | OpenAPI spec wellness (malformed YAML, ghost `$ref`, missing `operationId`/summary) |

The `cypress-e2e` job uses `cypress-io/github-action@v6` with `start: npm run start` and `wait-on: http://localhost:4200` — no backend needed, all API calls are intercepted.
The `openapi-lint` job runs `npx -y @stoplight/spectral-cli@6 lint docs/api/v1.yaml` against the ruleset at `.spectral.yaml`.

### On every push to `develop` or `main` — `.github/workflows/release.yml`

- **semantic-release** creates a Git tag and GitHub Release automatically based on conventional commits.
- Concurrency group per branch — no concurrent releases on the same branch.

---

## What Claude Should Always Do

Cross-cutting rules. For backend-only rules (Uncle Bob canon, pre-push PHP gates, controller discipline) see [`server/CLAUDE.md`](./server/CLAUDE.md). For frontend-only rules (UX canon, PrimeNG, pre-push Angular gates) see [`client/CLAUDE.md`](./client/CLAUDE.md).

1. **Write tests first across all four layers** — PEST unit/feature, Vitest unit, Cypress E2E — before writing any implementation.
2. **Never commit to `main` or `develop` directly** — always cut a branch, then open a PR. After opening, add the PR to the GitHub Project board and set both the issue and PR items to `In Progress`.
3. **Always suggest the branch name** (including issue number) before starting any work.
4. **Use conventional commits** with lower-case subject in every `git commit`.
5. **Merge `develop` into the feature branch** when it falls behind — no rebase. The feature branch's own history can carry merge commits; they all collapse into a single commit at PR squash-merge time anyway. No force-push gymnastics, no IDE confusion, GitHub's "Update branch" button does the right thing by default.
6. **Squash merge** PRs into `develop`; merge commit (no squash) into `main`.
7. **Never create a `version` field** in `package.json` — semantic-release owns versioning entirely.
8. **Reply to all Copilot comments** after fixing: English only, always cite the short commit SHA (`Fixed in abc1234.`), re-read and update the PR body if the fixes changed anything it describes, then switch label to `🟢 ready to merge`.
9. **Never add AI attribution** — no "Generated with Claude Code", "Co-Authored-By: Claude", or similar anywhere.
10. **Keep `docs/` in sync** — every PR that changes a migration, an enum, an API route, a request/response shape, or a business rule must update the relevant file in `docs/entities/` or `docs/api/v1.yaml` in the same commit history. See the "Documentation discipline" section for what counts as "substantial" and what doesn't. Internal refactors, formatting, and dependency bumps are exempt.
11. **Respect the local canon.** When you write backend code, apply the Uncle Bob rules in `server/CLAUDE.md`. When you write frontend code, apply the UX canon in `client/CLAUDE.md`. A reviewer's citation of any book or law in those canons is a valid critique on its own — push back only with a specific pragmatic reason, never with taste.
