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
| PHP static analysis | PHPStan | 2 (level max) |
| PHP test runner | PEST | 4 |
| Client framework | Angular | 21 |
| UI component library | PrimeNG | 21 |
| Containerization | Docker + Docker Compose | latest |

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
| `main` | Production-ready code only. Tagged on every release. | — |
| `develop` | Integration branch. All features land here first. | `main` (via release) |
| `feat/*` | New features. Cut from `develop`, merged back via PR. | `develop` |
| `fix/*` | Bug fixes on develop flow. | `develop` |
| `hotfix/*` | Urgent production fixes. Cut from `main`. | `main` + `develop` |
| `release/*` | Release stabilisation (bump version, changelog). | `main` + `develop` |
| `chore/*` | Tooling, deps, CI, Docker — no business logic. | `develop` |
| `refactor/*` | Code restructuring with no behaviour change. | `develop` |
| `docs/*` | Documentation only. | `develop` |

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
- `release/1.2.0`

**Types:** `feat`, `fix`, `hotfix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`, `release`

### Commit Messages (Angular Conventional Commits)
```
<type>(<scope>): <short description in imperative mood>

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

### PR Rules
- **No direct commits to `main` or `develop`** — ever, not even for hotfixes.
- All feature/fix/chore branches open PRs **exclusively toward `develop`**.
- `develop` → `main` only via a `release/*` branch when shipping.
- **Squash merge only** into `develop`. One clean commit per feature.
- **Merge commit** (no squash) from `release/*` into `main`.
- Delete the branch after merge.

### PR Checklist for Claude — every PR must include

1. **Title** — conventional commit format: `type(scope): description`
2. **Description** — filled template (What / Why / How / Checklist / References) in English with emoji
3. **Assignee** — always assign `m-bonanno` (`gh pr create --assignee m-bonanno`)
4. **Labels** — apply one **type** label + the appropriate **status** label on open.

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
| `release/*` | `🔖 release` |
| `test/*` | `🧪 testing` |

Add `💥 breaking change` as a second type label when the PR contains a `BREAKING CHANGE` footer.

#### Status labels (update as the PR progresses)

| Moment | Label |
|--------|-------|
| PR just opened | `🟡 in review` |
| Copilot/human review resolved, ready to merge | `🟢 ready to merge` |
| Waiting on a dependency or decision | `🔴 blocked` |
| Still being worked on | `🚧 wip` |

Remove `🟡 in review` and add `🟢 ready to merge` when all review comments are resolved.

Use `gh pr create --label "✨ feature,🟡 in review"` (comma-separated, no spaces around comma).

### Release Flow

```bash
# Cut release branch from develop
git checkout develop && git pull
git checkout -b release/1.0.0

# Bump version, update changelog, final QA
# Then merge into main AND back into develop
git checkout main && git merge --no-ff release/1.0.0
git tag -a v1.0.0 -m "release: v1.0.0"
git checkout develop && git merge --no-ff release/1.0.0
git branch -d release/1.0.0
```

### Hotfix Flow

```bash
# Cut from main, not develop
git checkout main && git pull
git checkout -b hotfix/token-expiry-crash

# Fix, test, commit
git commit -m "fix(auth): prevent crash on expired token decode"

# Merge into main AND develop
git checkout main && git merge --no-ff hotfix/token-expiry-crash
git tag -a v1.0.1 -m "fix: v1.0.1"
git checkout develop && git merge --no-ff hotfix/token-expiry-crash
git branch -d hotfix/token-expiry-crash
```

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

### Testing (PEST 4)
- Feature tests hit real DB via `RefreshDatabase`.
- Unit tests mock external dependencies.
- Coverage target: **80% minimum** on business logic.

### API conventions
- Versioned routes: `/api/v1/...`
- JSON:API-style responses with consistent error envelope.
- Authentication via **Laravel Sanctum** (token-based for SPA).

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

On every PR to `develop`:
1. PHPStan analysis (level 9)
2. PEST test suite (with coverage)
3. Angular lint + build check
4. Docker build smoke test

On merge to `main` (release):
1. All of the above
2. Docker build & push to registry
3. Deploy to production

---

## What Claude Should Always Do

1. **Write the PEST test first**, then the implementation (TDD).
2. **Suggest PrimeNG components** by name when building any UI element.
3. **Keep controllers thin** — business logic in Services or Actions.
4. **Use Form Requests** for all Laravel validation.
5. **Explain FE decisions** in plain terms (the developer is BE-focused).
6. **Never commit to `main` or `develop` directly** — always cut a branch, then open a PR.
7. **Always suggest the branch name** before starting any work (`feat/...`, `fix/...`, etc.).
8. **Use conventional commits** in every `git commit` suggestion.
9. **Rebase, don't merge**, when updating a feature branch from `develop`.
10. **Squash merge** PRs into `develop`; merge commit into `main` for releases.
