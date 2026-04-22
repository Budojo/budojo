# Budojo — Claude Code Guidelines

## Project Overview

**Budojo** is a full-stack web application with a decoupled architecture:
- **Server** — REST API built with Laravel 13 (PHP), served via Docker
- **Client** — SPA built with Angular 21 + PrimeNG 21, served via Docker

The two containers communicate over a shared Docker network. A dedicated build script handles production deployment.

---

## Principles

### Code Quality
- **SOLID** — every class has a single responsibility; depend on abstractions, not concretions.
- **DRY** — no duplicated logic; extract shared behaviour into services, traits, or utilities.
- **KISS** — prefer the simplest solution that works; add complexity only when genuinely required.

### Test-Driven Development (TDD)
- **Always write the test first**, then the implementation.
- PHP: use **PEST 4** for both unit and feature tests.
- Angular: use **Jest** for unit tests and **Cypress** for e2e.
- No untested business logic is merged to `main`.

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
| Containerization | Docker + Docker Compose | latest |
| Release automation | semantic-release | 24 |
| Commit enforcement | Husky 9 + commitlint | — |

---

## Git Workflow

### Branch Model (GitFlow)

```
main
 └── develop
      ├── feat/user-authentication
      ├── feat/user-profile
      ├── fix/login-validation-error
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
| `ci/*` | CI/CD pipeline changes. | `develop` |

### Daily Development Flow

```bash
# 1. Always start from an up-to-date develop
git checkout develop && git pull origin develop

# 2. Cut a feature branch
git checkout -b feat/user-registration

# 3. Work in small, atomic commits (TDD cycle: test → implement → refactor)
git commit -m "test(users): add PEST feature test for registration endpoint"
git commit -m "feat(users): implement RegisterUserAction"
git commit -m "feat(users): add UserResource and registration controller"

# 4. Keep the branch up to date with develop (rebase preferred over merge)
git fetch origin && git rebase origin/develop

# 5. Open PR → develop when the feature is complete and tests pass
```

### Pre-push Checklist — run these before every `git push`

**Whenever PHP files were changed:**
```bash
# 1. Auto-fix code style
cd server && vendor/bin/php-cs-fixer fix

# 2. Static analysis — must report 0 errors before pushing
cd server && vendor/bin/phpstan analyse --no-progress
```

**Whenever Angular files were changed:**
```bash
# 1. Auto-fix formatting
cd client && node_modules/.bin/prettier --write "src/**/*.{ts,html,scss}"

# 2. Lint — must report 0 errors before pushing
cd client && npm run lint
```

> Run formatters/fixers **before staging** so the fixed files are included in the commit.
> Run static analysis / lint **after staging** to verify the final state.
> Never rely on CI to catch these issues — fix locally first.

### Branch Naming (Angular convention)
```
<type>/<short-description-in-kebab-case>
```
Examples:
- `feat/user-authentication`
- `feat/user-profile`
- `fix/login-validation-error`
- `hotfix/token-expiry-crash`
- `refactor/auth-service-cleanup`
- `chore/update-dependencies`

**Types:** `feat`, `fix`, `hotfix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`

### Commit Messages (Angular Conventional Commits)
```
<type>(<scope>): <short description in imperative mood, lower-case>

[optional body — explain WHY, not what]

[optional footer: BREAKING CHANGE: ..., closes #issue]
```
Examples:
- `feat(auth): add JWT refresh token endpoint`
- `fix(users): handle duplicate email on registration`
- `test(auth): add PEST feature test for login flow`
- `chore(docker): add production build script`
- `refactor(users): extract registration logic into RegisterUserAction`
- `BREAKING CHANGE` in footer when a public API contract changes

> Commitlint enforces this format locally via Husky. The subject must be lower-case.

### PR Rules
- **No direct commits to `main` or `develop`** — ever, not even for hotfixes.
- All feature/fix/chore branches open PRs **exclusively toward `develop`**.
- `develop` → `main` only via a PR (no intermediate release branch needed — semantic-release handles tagging automatically).
- **Squash merge only** into `develop`. One clean commit per feature.
- **Merge commit** (no squash) from `develop` into `main`.
- Delete the branch after merge.

### PR Checklist for Claude — every PR must include

1. **Title** — conventional commit format: `type(scope): description`
2. **Description** — filled template (What / Why / How / Checklist / References) in English with emoji
3. **Assignee** — always assign `m-bonanno` (`gh pr create --assignee m-bonanno`)
4. **Labels** — apply one **type** label + the appropriate **status** label on open.

> **Important — PR body formatting:** Always write the body to a temp file (`.claude/pr-body.md`) and use `gh pr edit <N> --body-file .claude/pr-body.md`.
> Never pass the body inline via `--body "..."` or a bash heredoc — backticks and special characters get escaped and render as literal `\`` in GitHub.

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

Add `💥 breaking change` as a second type label when the PR contains a `BREAKING CHANGE` footer.

#### Status labels (update as the PR progresses)

| Moment | Label |
|--------|-------|
| Still being worked on | `🚧 wip` |
| All review comments resolved, ready to merge | `🟢 ready to merge` |
| Waiting on a dependency or decision | `🔴 blocked` |

Open with the type label. Switch to `🟢 ready to merge` once Copilot review comments are addressed.

### Release Flow (automated via semantic-release)

Versioning, changelogs, and **Git tags** are fully automated — no manual tagging or version bumps ever.

**Beta release** — every squash merge to `develop`:
1. semantic-release reads conventional commits since the last tag
2. Determines the next version bump (`fix` → patch, `feat` → minor, `BREAKING CHANGE` → major)
3. Creates Git tag `vX.Y.Z-beta.N` on the repo + GitHub pre-release + updates `CHANGELOG.md`

**Stable release** — every merge commit from `develop` → `main`:
1. semantic-release reads conventional commits since the last stable tag
2. Creates Git tag `vX.Y.Z` on the repo + GitHub Release with full changelog

**Config:** `.releaserc.json` at the repo root.
- Do not create a `version` field in `package.json` — semantic-release owns versioning entirely.
- `package-lock.json` is committed; always run `npm install` after changing `package.json`.

### Hotfix Flow

```bash
# 1. Cut from main, not develop
git checkout main && git pull origin main
git checkout -b hotfix/token-expiry-crash

# 2. Fix, test (TDD), commit
git commit -m "fix(auth): prevent crash on expired token decode"

# 3. Open PR → main, merge (semantic-release will tag automatically)
# 4. Backport: open a second PR → develop to keep branches in sync
```

### Copilot Review Workflow

When the user says "Copilot ha lasciato commenti":
1. Fetch all review comments via `gh api repos/m-bonanno/budojo/pulls/<N>/comments`
2. For each comment: evaluate, fix if valid, skip if not applicable
3. Commit fixes with `fix(<scope>): address copilot review comments`
4. Reply to each comment thread via `gh api repos/m-bonanno/budojo/pulls/<N>/comments/<id>/replies -X POST --field body="..."`
5. Push and update label to `🟢 ready to merge`

---

## Server (Laravel 13)

### Structure conventions
- **Controllers** — thin; delegate all logic to services.
- **Services** — contain business logic; injected via constructor DI.
- **Repositories** (optional) — abstract Eloquent queries when models are complex.
- **Form Requests** — all input validation lives here, never in controllers.
- **Resources** — all API responses go through Laravel API Resources.
- **Actions** — single-responsibility classes for complex operations (e.g. `RegisterUserAction`).

### Static Analysis
- PHPStan runs at **level 9** (max).
- Config: `phpstan.neon` in `/server`.
- CI blocks merge if PHPStan reports errors.

### Code Style (PHP CS Fixer)
- Config: `server/.php-cs-fixer.php`
- Rulesets: `@PHP84Migration`, `@PSR12`, `@PSR12:risky`
- Key rules: `declare_strict_types`, `use_arrow_functions`, `ordered_imports`, `single_trait_insert_per_statement`
- Scans: `app/`, `routes/`, `tests/` (config/ and database/ excluded — Laravel boilerplate)
- CI blocks merge if any file needs fixing

### Testing (PEST 4)
- Feature tests hit real DB via `RefreshDatabase` (SQLite `:memory:` in CI via `phpunit.xml`)
- Unit tests mock external dependencies
- Coverage is generated on every PR; no global minimum threshold — grows with TDD

### API conventions
- Versioned routes: `/api/v1/...`
- JSON:API-style responses with consistent error envelope
- Authentication via **Laravel Sanctum** (token-based for SPA)

---

## Client (Angular 21 + PrimeNG 21)

> **Note for Claude:** The developer has no frontend experience. Always explain Angular/TypeScript decisions clearly, suggest the simplest PrimeNG component that fits the use case, and avoid over-engineering the FE.

### Structure conventions
- Feature modules under `src/app/features/<feature-name>/`
- Shared components in `src/app/shared/`
- HTTP calls only in `*.service.ts` files (never in components)
- Components use **OnPush** change detection by default
- State management via **Angular Signals** (no NgRx unless complexity demands it)

### UI
- All UI components come from **PrimeNG 21**.
- Use PrimeFlex for layout utilities.
- Follow PrimeNG's theming system; no inline styles.

---

## Docker

### Services
| Container | Purpose | Port |
|-----------|---------|------|
| `api` | Laravel PHP-FPM + Nginx | 8000 |
| `client` | Angular dev server / Nginx (prod) | 4200 / 80 |
| `db` | MySQL 8.4 | 3306 |

### Scripts
- `docker/dev.sh` — start full dev environment
- `docker/build-prod.sh` — build optimised production images
- All secrets via `.env` (never committed)

---

## CI/CD (GitHub Actions)

### On every PR to `develop` — `.github/workflows/pr-checks.yml`
1. **PHPStan** (level 9) — static analysis
2. **PEST** (parallel, with coverage) — full test suite
3. **PHP CS Fixer** (dry-run) — code style check

### On every push to `develop` or `main` — `.github/workflows/release.yml`
- **semantic-release** runs automatically
- Creates a Git tag and GitHub Release/pre-release based on conventional commits
- Concurrency group per branch — no concurrent releases on the same branch

---

## What Claude Should Always Do

1. **Write the PEST test first**, then the implementation (TDD).
2. **Suggest PrimeNG components** by name when building any UI element.
3. **Keep controllers thin** — business logic in Services or Actions.
4. **Use Form Requests** for all Laravel validation.
5. **Explain FE decisions** in plain terms (the developer is BE-focused).
6. **Never commit to `main` or `develop` directly** — always cut a branch, then open a PR.
7. **Always suggest the branch name** before starting any work (`feat/...`, `fix/...`, etc.).
8. **Use conventional commits** with lower-case subject in every `git commit`.
9. **Rebase, don't merge**, when updating a feature branch from `develop`.
10. **Squash merge** PRs into `develop`; merge commit into `main`.
11. **Never create a `version` field** in `package.json` — semantic-release owns versioning.
12. **Reply to all Copilot comments** after fixing, using the review workflow above.
13. **Before pushing PHP changes**: run `vendor/bin/php-cs-fixer fix` then `vendor/bin/phpstan analyse --no-progress` — both must be clean.
14. **Before pushing Angular changes**: run `node_modules/.bin/prettier --write "src/**/*.{ts,html,scss}"` then `npm run lint` — both must be clean.
