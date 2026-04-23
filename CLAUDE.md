# Budojo — Claude Code Guidelines

## Project Overview

**Budojo** is a full-stack web application with a decoupled architecture:
- **Server** — REST API built with Laravel 13 (PHP), served via Docker
- **Client** — SPA built with Angular 21 + PrimeNG 21, served via Docker

The two containers communicate over a shared Docker network. A `.env` file at the repo root holds the configuration for docker-compose and is injected into the `api` container via `env_file`.

---

## Principles

### Code Quality

Non-negotiable baseline. Full canon in the **Code craftsmanship** section below.

**SOLID** — each letter is a concrete obligation, not a slogan:

- **S — Single Responsibility.** A class changes for one reason and one reason only. If a class has two obvious callers with different motives to edit it, split it. Controllers orchestrate, Actions do one business operation, FormRequests validate, Resources shape responses. No class wears multiple hats.
- **O — Open/Closed.** Code is open to extension, closed to modification. Prefer adding a new Action over editing an existing one. Prefer a new `DocumentType` enum case over an `if/else` chain in a service.
- **L — Liskov Substitution.** A subtype must be usable wherever the supertype is expected, without surprises. In practice here: don't override a method to throw or to return a different shape; respect the parent contract (see the Copilot comment on `UpdateDocumentRequest::validated()` in PR #33 for a real case we actually fixed).
- **I — Interface Segregation.** Consumers shouldn't depend on methods they don't use. Favor small, focused contracts. In Laravel this mostly shows up in FormRequest classes (one per operation) and in Action classes (one `execute(...)` method each).
- **D — Dependency Inversion.** High-level policy doesn't depend on low-level detail; both depend on abstractions. Injecting services/Actions via constructor instead of `Container::make()` inside methods is the first concrete application.

**DRY** — no duplicated logic. Extract shared behaviour into Actions, services, traits, or test helpers (we did this for `userWithAcademy()` in `tests/Pest.php`). **But:** duplication that looks accidental is different from shared knowledge — don't prematurely extract a second-occurrence match if the two sites will evolve independently.

**KISS** — the simplest thing that could possibly work. Add complexity only when a real requirement demands it. If a future M5 email reminder "might" want something, don't build it today.

**Boy Scout Rule** — leave the code cleaner than you found it. Touched a file to fix a bug? Rename an unclear variable, delete a dead comment, tighten an overly clever expression in the same PR. But keep these changes tightly scoped — a 200-line PR that "also does some cleanup" is harder to review than two focused PRs.

### Test-Driven Development (TDD)

**Always write the failing test first, then write the minimum code to make it pass.**

Four test layers are mandatory — all must be green before a PR is opened:

| Layer | Stack | Scope |
|-------|-------|-------|
| **PHP unit** | PEST 4 | Isolated classes — Actions, validators, value objects |
| **PHP feature** | PEST 4 + `RefreshDatabase` | Full HTTP round-trips against an in-memory SQLite DB |
| **Angular unit** | Vitest 4 | Components and services in isolation |
| **Angular E2E** | Cypress 13 | User flows in a real browser; all API calls intercepted with `cy.intercept()` |

**TDD cycle:**
```
Write failing PEST spec       →  implement PHP code        →  all PEST tests green
Write failing Vitest spec     →  implement Angular code    →  all Vitest tests green
Write failing Cypress spec    →  verify navigation/flows   →  all Cypress tests green
```

No untested business logic is merged to `develop`.

---

## Code craftsmanship — the Uncle Bob canon

This project is written (and reviewed) in the spirit of Robert C. Martin's "Clean" series. When a reviewer asks "why did you do it that way?" the intended default reference is one of these four books, by name. They are our shared vocabulary for judging code.

| Book | What we take from it |
|------|----------------------|
| **Clean Code** (2008) | Function hygiene, naming, comments, tests as first-class code |
| **The Clean Coder** (2011) | Professional discipline — saying no, owning estimates, refusing to ship slop under pressure |
| **Clean Architecture** (2017) | SOLID in depth, the Dependency Rule, layered boundaries between policy and I/O |
| **Clean Agile** (2019) | XP practices — TDD, pair programming, continuous refactoring, small releases |

If a reviewer (human or Copilot) cites one of these books and the commit diff violates it, the citation is a valid argument on its own. Push back only with a specific, pragmatic reason (e.g. "Laravel's conventions override here, see the Active Record note below"). "I prefer it this way" is not a reason.

### Clean Code — daily practice

These are concrete obligations when you write PHP or TypeScript in this repo:

- **Meaningful names.** `createAcademy` is good, `handle` is lazy, `$a` is banned outside a two-line lambda. Class names are nouns (`UploadDocumentAction`). Method names are verbs (`execute`, `list`, `download`). Boolean variables read as questions (`$isExpired`, `$hasAcademy`). Avoid Hungarian notation, abbreviations, and "manager/processor/data" suffixes that say nothing.
- **Small functions.** If a method doesn't fit on a screen, it's too long. If it has more than two levels of indentation, extract. Controller action > ~20 lines is a smell; most of ours sit at 10–15.
- **One thing per function.** A function either does, decides, or returns — not all three. `execute()` on an Action returns the created model; it doesn't also send an email. Side-effects are deliberate and named.
- **Few arguments.** Zero is ideal, 1–2 is fine, 3 is a stretch, 4+ is a refactor. If you're reaching for a 5-argument method, you need a DTO / value object (see `AthletePayload` on the Angular side).
- **No flag arguments.** A boolean that flips the function's behavior is two functions in a trench coat. Split it.
- **Comments are a failure.** Self-documenting code first. Comments only for *why*, never *what*. If the code needs a comment to explain what it does, the code is not clear enough — rename, extract, restructure. Exception: Laravel/Symfony quirks and non-obvious business rules (e.g. "We wipe the file before soft-deleting the row because …") — those are worth explaining.
- **Tests are first-class code.** Same naming standards, same cleanliness, same refactoring discipline. A test that's hard to read is a test that lies when it passes.

### Clean Architecture — how this codebase maps

Uncle Bob's clean architecture pushes I/O (DB, web, filesystem, UI) to the edges and keeps business rules at the center. This Laravel codebase isn't a pure Clean Architecture shop — but we approximate it deliberately:

| Clean Architecture layer | Where it lives in Budojo |
|--------------------------|---------------------------|
| **Entities** (enterprise business rules) | `App\Enums` + domain invariants enforced in `Actions` |
| **Use Cases / Interactors** | `App\Actions\*` (e.g. `UploadDocumentAction`, `DeleteDocumentAction`) — one public `execute` method each |
| **Interface Adapters** | `App\Http\Requests` (inbound boundary), `App\Http\Resources` (outbound boundary), `App\Http\Controllers` (thin orchestration) |
| **Frameworks & Drivers** | Laravel itself (routing, container, Eloquent), Angular, PrimeNG, Cypress, PEST |

**The Dependency Rule.** Dependencies point inward. A Controller can call an Action; an Action MUST NOT depend on a Controller. A Model/Action MUST NOT depend on an HTTP Request — accept typed arguments instead. If a new Action needs user context, it takes a `User $user` parameter; it does NOT call `auth()->user()`.

**Humble Object pattern.** Controllers, Observers, and Resources are "humble" — minimal logic, easy to leave alone. All conditional business rules live in Actions, which are framework-light and unit-testable without Laravel's HTTP stack.

### The Active Record caveat — pragmatic, not dogmatic

Laravel's Eloquent Model is an **Active Record**. Clean Architecture would prefer a plain-data Entity with a separate Repository. We consciously accept Active Record because:

1. Laravel's whole ecosystem (migrations, relations, factories, seeders, broadcasting) assumes it.
2. Fighting the framework creates more accidental complexity than decoupling saves.
3. Our real-world blast radius is small (a single webapp, no multi-client SDK).

**The compensating discipline**: we keep the Model skinny. No business logic in models — only relations, casts, scopes, and `#[ObservedBy]` wiring. Business logic lives in Actions. This preserves 90% of the testability and reasoning benefits of the Clean split, at 10% of the friction.

If this assumption ever breaks (e.g. we grow a CLI tool that needs to write documents without booting the full Laravel HTTP stack) we revisit. Until then, Active Record stands.

### Clean Agile — the meta-rule

Agile is the 90s practices XP put on the map, not the ceremony that corporations grafted on top in 2010. In this repo that means:

- **TDD is default, not optional.** See the TDD section above — four layers, test first, no exceptions for "simple" code.
- **Refactor continuously.** Every time you touch a file, scan for dead code, unclear names, missed extractions. Apply the Boy Scout Rule with discipline.
- **Small releases.** Each PR ships independently — M2 was four PRs, M3 is four PRs. The mega-PR-merging-weeks-of-work style is forbidden here.
- **Honesty about estimates.** If a task is harder than expected, say so. Don't silently compress scope to look on-track.
- **Say no.** When a feature request violates scope or craftsmanship ("just slap it in, we'll fix it later"), refuse in writing and propose the right way.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Server framework | Laravel | 13 |
| Database | MySQL | 8.4 LTS |
| PHP static analysis | PHPStan | 2 (level 9) |
| PHP code style | PHP CS Fixer | 3 |
| PHP test runner | PEST | 4 |
| Client framework | Angular | 21 |
| UI component library | PrimeNG | 21 |
| Angular unit tests | Vitest | 4 |
| Angular E2E tests | Cypress | 13 |
| API contract | OpenAPI | 3.0.3 |
| OpenAPI linter | Spectral | 6 |
| Containerization | Docker + Docker Compose | latest |
| Release automation | semantic-release | 24 |
| Commit enforcement | Husky 9 + commitlint | — |

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

| Branch | Purpose | Merge target |
|--------|---------|-------------|
| `main` | Production-ready code only. Every merge creates a stable tag. | — |
| `develop` | Integration branch. All features land here first. Every merge creates a beta tag. | `main` (via PR) |
| `feat/*` | New features. Cut from `develop`, merged back via PR. | `develop` |
| `fix/*` | Bug fixes on develop flow. | `develop` |
| `hotfix/*` | Urgent production fixes. Cut from `main`. | `main` + `develop` |
| `chore/*` | Tooling, deps, CI, Docker — no business logic. | `develop` |
| `refactor/*` | Code restructuring with no behaviour change. | `develop` |
| `docs/*` | Documentation only. | `develop` |
| `test/*` | Test-only additions or fixes. | `develop` |
| `ci/*` | CI/CD pipeline changes. | `develop` |

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

# 4. Keep the branch up to date with develop (rebase, never merge)
git fetch origin && git rebase origin/develop

# 5. Open PR → develop when all tests pass
```

### Pre-push Checklist — run before every `git push`

**Whenever PHP files were changed:**
```bash
cd server

# 1. Auto-fix code style
vendor/bin/php-cs-fixer fix

# 2. Static analysis — must report 0 errors
vendor/bin/phpstan analyse --no-progress

# 3. Full test suite — must be all green
vendor/bin/pest --parallel
```

**Whenever Angular files were changed:**
```bash
cd client

# 1. Auto-fix formatting
npx prettier --write "src/**/*.{ts,html,scss}"

# 2. Lint — must report 0 errors
npm run lint

# 3. Unit tests — must be all green
npm test -- --watch=false
```

> Cypress E2E tests require `ng serve` running — they are validated in CI.
> Run `npm run cy:open` locally when you need to debug a specific E2E spec.

> Run formatters/fixers **before staging** so the fixed files are included in the commit.
> Run static analysis / lint **after staging** to verify the final state.
> Never rely on CI to catch these — fix locally first.

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

The board tracks **both issues and their open PRs**. Issues are the primary items; PRs are added alongside them so the connection is visible directly on the board.

#### Issue + PR lifecycle on the board

| Status | When |
|--------|------|
| `Todo` | Issue created |
| `In Progress` | PR opened (set on both the issue item AND the PR item) |
| `Done` | PR merged → GitHub auto-closes issue → both items move to Done |

#### Standard flow — step by step

1. **Create issue** → it lands on the board as `Todo`.
2. **Cut branch** named `<type>/<issue-number>-<description>`.
3. **Open PR** with `Closes #N` in the body.
4. **Add the PR to the project board** (GitHub does NOT do this automatically):
   ```bash
   PR_NODE_ID=$(gh pr view <N> --json id --jq '.id')
   gh api graphql -f query='
   mutation($projectId: ID!, $contentId: ID!) {
     addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
       item { id }
     }
   }' -f projectId="PVT_kwHOAsnvsM4BVW8P" -f contentId="$PR_NODE_ID"
   ```
5. **Set both the issue item AND the PR item to `In Progress`**:
   ```bash
   gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: {
     projectId: "PVT_kwHOAsnvsM4BVW8P"
     itemId: "<ITEM_ID>"
     fieldId: "PVTSSF_lAHOAsnvsM4BVW8PzhQzRlk"
     value: { singleSelectOptionId: "47fc9ee4" }
   }) { projectV2Item { id } } }'
   ```
   Status option IDs: `f75ad846` = Todo · `47fc9ee4` = In Progress · `98236657` = Done
6. **When the PR is merged**, GitHub auto-closes the linked issue and both items move to `Done`.

#### Rules

1. **Branch names include the issue number** — this is the traceability link.
2. **Every PR body must contain `Closes #N`** (or `Fixes #N`) for each issue it resolves.
3. **Always add the PR to the project board** right after opening it.
4. **Assign `m-bonanno`** and apply the correct type label on every PR.

#### Finding a project item ID
```bash
gh project item-list 2 --owner m-bonanno --format json
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
2. **Description** — filled template (What / Why / How / Checklist / References) in English
3. **Assignee** — always assign `m-bonanno` (`gh pr edit <N> --add-assignee m-bonanno`)
4. **Labels** — apply the type label at creation (see table below).
5. **Project board** — add the PR, set to `In Progress`.
6. **No AI attribution — ever** — do NOT add "Generated with Claude Code", "Co-Authored-By: Claude", or any Anthropic/AI text anywhere: PR bodies, commit messages, code comments, docs.

> **PR body formatting:** Always write the body to `.claude/pr-body.md` and pass it with
> `gh pr create --body-file .claude/pr-body.md` or `gh pr edit <N> --body-file .claude/pr-body.md`.
> Never use `--body "..."` or a bash heredoc — special characters get mangled.

#### Type labels (one per PR)

| Branch prefix | Label |
|--------------|-------|
| `feat/*` | `✨ feature` |
| `fix/*` | `🐛 bug fix` |
| `hotfix/*` | `🚑 hotfix` |
| `chore/*` | `🔧 maintenance` |
| `ci/*` | `⚙️ pipeline` |
| `docs/*` | `📝 documentation` |
| `refactor/*` | `♻️ refactor` |
| `test/*` | `🧪 testing` |

Add `💥 breaking change` as a second label when the PR contains a `BREAKING CHANGE` footer.

#### Status labels

| Moment | Label |
|--------|-------|
| Still being worked on | `🚧 wip` |
| All review comments resolved, ready to merge | `🟢 ready to merge` |
| Waiting on a dependency or decision | `🔴 blocked` |

Open with the type label only. Switch to `🟢 ready to merge` once all Copilot comments are addressed.

### Release Flow (automated via semantic-release)

Versioning, changelogs, and Git tags are fully automated — no manual tagging or version bumps ever.

**Beta release** — every squash merge to `develop`:
1. semantic-release reads conventional commits since the last tag
2. Determines the next version bump (`fix` → patch, `feat` → minor, `BREAKING CHANGE` → major)
3. Creates tag `vX.Y.Z-beta.N` + GitHub pre-release + updates `CHANGELOG.md`

**Stable release** — every merge commit from `develop` → `main`:
1. semantic-release reads conventional commits since the last stable tag
2. Creates tag `vX.Y.Z` + GitHub Release with full changelog

**Config:** `.releaserc.json` at the repo root.
- Do not create a `version` field in `package.json` — semantic-release owns versioning.
- `package-lock.json` is committed; always run `npm install` after changing `package.json`.

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
1. Fetch all comments: `gh api repos/m-bonanno/budojo/pulls/<N>/comments`
2. For each comment: evaluate, fix if valid, skip with explanation if not applicable
3. Commit all fixes in one commit: `fix(<scope>): address copilot review comments`
4. Reply to every comment thread: `gh api repos/m-bonanno/budojo/pulls/<N>/comments/<id>/replies -X POST -f body="..."`
5. **Re-read the PR body and update it if the fixes changed anything it describes** (counts, paths, commands, structure, examples). A stale PR body misleads reviewers. Rewrite `.claude/pr-body.md` and push with `gh pr edit <N> --body-file .claude/pr-body.md`.
6. Push and switch label to `🟢 ready to merge`.

**Reply rules (mandatory):**
- **Always write in English** — never Italian, regardless of the comment language.
- **Always reference the fix commit** — include the short SHA in every reply: `Fixed in abc1234.`
- Keep replies concise: one sentence on what changed + the commit SHA.

---

## Server (Laravel 13)

### Structure conventions

```
server/app/
├── Actions/        # Single-responsibility business operations (e.g. CreateAcademyAction)
├── Enums/          # Backed PHP enums (Belt, AthleteStatus, …)
├── Http/
│   ├── Controllers/  # Thin — validate input via Form Request, call Action, return Resource
│   ├── Requests/     # All input validation lives here, never in controllers
│   └── Resources/    # All API response shaping — never return raw Eloquent models
└── Models/         # Eloquent models — relations, scopes, casts only; no business logic
```

- **Controllers** — thin: receive request → delegate to Action → return Resource.
- **Actions** — contain all business logic; one class, one operation.
- **Form Requests** — validation and authorisation gates.
- **Resources** — shape every API response; never expose raw model attributes.
- **Models** — relations, scopes, casts. No business logic.

### Static Analysis
- PHPStan at **level 9** (max). Config: `server/phpstan.neon`.
- CI blocks merge on any error.

### Code Style (PHP CS Fixer)
- Config: `server/.php-cs-fixer.php`
- Rulesets: `@PHP84Migration`, `@PSR12`, `@PSR12:risky`
- Key rules: `declare_strict_types`, `use_arrow_functions`, `ordered_imports`
- CI blocks merge if any file needs fixing.

### Testing (PEST 4)

```bash
cd server

# Run all tests
vendor/bin/pest --parallel

# Run a single file
vendor/bin/pest tests/Feature/Athlete/AthleteTest.php
```

- **Feature tests** hit a real SQLite `:memory:` DB via `RefreshDatabase`; run full HTTP round-trips.
- **Unit tests** mock external dependencies.
- Coverage generated on every PR; grows with TDD — no enforced minimum threshold.

### API conventions
- Versioned routes: `/api/v1/...` defined in `routes/api_v1.php`
- JSON:API-style responses with consistent error envelope
- Auth via **Laravel Sanctum** Bearer tokens (token per session, not cookie)

---

## Client (Angular 21 + PrimeNG 21)

> **Note for Claude:** The developer is BE-focused. Always explain Angular/TypeScript decisions clearly, suggest the simplest PrimeNG component that fits, and avoid over-engineering.

### Structure conventions

```
client/src/app/
├── core/
│   ├── guards/        # Route guards (authGuard, hasAcademyGuard, noAcademyGuard)
│   ├── interceptors/  # HTTP interceptors (auth token attachment)
│   └── services/      # AuthService, AcademyService, AthleteService — HTTP only here
├── features/
│   ├── auth/          # Login, Register pages
│   ├── academy/       # Setup page
│   ├── athletes/      # List page (and future detail/edit)
│   └── dashboard/     # Layout shell (sidebar + router-outlet)
└── shared/
    └── components/    # BeltBadge and other reusable presentational components
```

- Feature folders under `src/app/features/<feature>/`
- HTTP calls only in `*.service.ts` — never inside components
- Components use **OnPush** change detection by default
- State via **Angular Signals** — no NgRx unless complexity genuinely demands it
- Standalone components only (no NgModules)

### UI
- All UI components from **PrimeNG 21** — check the docs before rolling custom components.
- Layout utilities from **PrimeFlex**.
- Follow PrimeNG's theming system; no inline styles.

### Testing — Vitest 4 (unit) + Cypress 13 (E2E)

#### Unit tests (Vitest)

```bash
cd client
npm test -- --watch=false       # single run
npm test                        # watch mode
```

- Test components, services, and guards in isolation.
- Mock `HttpClient` with `provideHttpClientTesting()`.
- Config: `vitest.config.ts` at `client/`.

#### E2E tests (Cypress)

```bash
cd client
npm run cy:open                 # interactive mode (requires ng serve running)
npm run cy:run                  # headless run (CI mode, requires ng serve running)
```

**Rules:**
- **Always mock every HTTP call** with `cy.intercept()` — E2E tests must not depend on a live backend.
- Use `cy.visitAuthenticated(url)` (custom command in `cypress/support/commands.ts`) to pre-seed `auth_token` in localStorage before Angular boots, satisfying the `authGuard`.
- When the **same endpoint is called multiple times in a test** (e.g. `GET /api/v1/academy` fires once for `noAcademyGuard` on page load and again for `hasAcademyGuard` after a redirect), use `times: 1` in the `beforeEach` intercept and add a second intercept in the specific test for the post-action call:
  ```typescript
  // beforeEach: allows access to /setup
  cy.intercept({ method: 'GET', url: '/api/v1/academy', times: 1 }, { statusCode: 404 }).as('guard');

  // inside redirect test: satisfies hasAcademyGuard after POST
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: {...} } }).as('guardAfter');
  ```
- Specs live in `cypress/e2e/*.cy.ts`; config in `cypress.config.ts`.

**Spec coverage:**

| File | What it tests |
|------|--------------|
| `navigation.cy.ts` | All guard redirect scenarios (unauthenticated, auth+no-academy, auth+has-academy) |
| `auth.cy.ts` | Login/register form rendering, validation, successful flows, nav links |
| `setup.cy.ts` | Academy setup form, validation, successful create → `/dashboard/athletes` |

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
| Container | Purpose | Port |
|-----------|---------|------|
| `budojo_api` | Laravel PHP-FPM + Nginx | 8000 |
| `budojo_client` | Angular dev server | 4200 |
| `budojo_db` | MySQL 8.4 | 3306 |

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

| Job | Tool | What it checks |
|-----|------|---------------|
| `phpstan` | PHPStan level 9 | PHP static analysis |
| `pest` | PEST 4 (parallel + coverage) | PHP unit + feature tests |
| `php-cs-fixer` | PHP CS Fixer (dry-run) | PHP code style |
| `angular-test` | Vitest 4 | Angular unit tests |
| `angular-lint` | ESLint | Angular TypeScript/template lint |
| `angular-format` | Prettier | Angular code formatting |
| `cypress-e2e` | Cypress 13 (Chrome headless) | Angular E2E flows |
| `openapi-lint` | Spectral 6 | OpenAPI spec wellness (malformed YAML, ghost `$ref`, missing `operationId`/summary) |

The `cypress-e2e` job uses `cypress-io/github-action@v6` with `start: npm run start` and `wait-on: http://localhost:4200` — no backend needed, all API calls are intercepted.
The `openapi-lint` job runs `npx -y @stoplight/spectral-cli@6 lint docs/api/v1.yaml` against the ruleset at `.spectral.yaml`.

### On every push to `develop` or `main` — `.github/workflows/release.yml`
- **semantic-release** creates a Git tag and GitHub Release automatically based on conventional commits.
- Concurrency group per branch — no concurrent releases on the same branch.

---

## What Claude Should Always Do

1. **Write tests first across all three layers** — PEST spec → Vitest spec → Cypress spec — before writing any implementation.
2. **Suggest PrimeNG components** by name when building any UI element; check PrimeNG 21 docs.
3. **Keep controllers thin** — validate via Form Request, delegate logic to an Action, return a Resource.
4. **Use Form Requests** for all Laravel validation; never validate in controllers.
5. **Explain FE decisions** in plain terms (the developer is BE-focused).
6. **Never commit to `main` or `develop` directly** — always cut a branch, then open a PR. After opening, add the PR to the GitHub Project board and set both the issue and PR items to `In Progress`.
7. **Always suggest the branch name** (including issue number) before starting any work.
8. **Use conventional commits** with lower-case subject in every `git commit`.
9. **Rebase, don't merge**, when updating a feature branch from `develop`.
10. **Squash merge** PRs into `develop`; merge commit (no squash) into `main`.
11. **Never create a `version` field** in `package.json` — semantic-release owns versioning entirely.
12. **Reply to all Copilot comments** after fixing: English only, always cite the short commit SHA (`Fixed in abc1234.`), re-read and update the PR body if the fixes changed anything it describes, then switch label to `🟢 ready to merge`.
13. **Before pushing PHP changes**: `php-cs-fixer fix` → `phpstan analyse` → `pest --parallel` — all must be clean.
14. **Before pushing Angular changes**: `prettier --write` → `npm run lint` → `npm test -- --watch=false` — all must be clean. Cypress runs in CI.
15. **Never add AI attribution** — no "Generated with Claude Code", "Co-Authored-By: Claude", or similar anywhere.
16. **Keep `docs/` in sync** — every PR that changes a migration, an enum, an API route, a request/response shape, or a business rule must update the relevant file in `docs/entities/` or `docs/api/v1.yaml` in the same commit history. See the "Documentation discipline" section for what counts as "substantial" and what doesn't. Internal refactors, formatting, and dependency bumps are exempt.
17. **Write code in the Uncle Bob canon.** SOLID, small single-purpose functions, intention-revealing names, comments only for *why*, tests-first, Dependency Rule (dependencies point inward). See the "Code craftsmanship" section for the full ruleset and the explicit mapping of our Laravel layers to Clean Architecture layers. When a reviewer cites Clean Code / Clean Architecture / Clean Agile by name, that citation is a valid critique on its own — push back only with a specific pragmatic reason, never with taste.
