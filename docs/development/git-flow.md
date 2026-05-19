# Git flow

Budojo uses **GitFlow** with two long-lived branches and short feature branches off `develop`.

## Branch model

```
main
 └── develop
      ├── feat/13-academy-setup
      ├── fix/22-login-validation-error
      └── chore/843-refine-claude-md-hierarchy
```

| Branch       | Purpose                                                                  | Merge target       |
| ------------ | ------------------------------------------------------------------------ | ------------------ |
| `main`       | Production-ready code only. Every merge creates a stable tag.            | —                  |
| `develop`    | Integration branch. Every merge creates a beta tag.                      | `main` (via PR)    |
| `feat/*`     | New features. Cut from `develop`, merged back via PR.                    | `develop`          |
| `fix/*`      | Bug fixes on develop flow.                                               | `develop`          |
| `hotfix/*`   | Urgent production fixes. Cut from `main`.                                | `main` + `develop` |
| `chore/*`    | Tooling, deps, CI, Docker — no business logic.                           | `develop`          |
| `refactor/*` | Code restructuring with no behaviour change.                             | `develop`          |
| `docs/*`     | Documentation only.                                                      | `develop`          |
| `test/*`     | Test-only additions or fixes.                                            | `develop`          |
| `ci/*`       | CI/CD pipeline changes.                                                  | `develop`          |

## Branch naming

```
<type>/<issue-number>-<short-description-in-kebab-case>
```

The issue number is mandatory — it's the traceability link between branch, PR, and board item.

Examples: `feat/13-academy-setup`, `fix/22-login-validation-error`, `hotfix/31-token-expiry-crash`, `chore/843-refine-claude-md-hierarchy`.

Allowed types: `feat`, `fix`, `hotfix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`.

## Daily development cycle

```bash
# 1. Start from an up-to-date develop
git checkout develop && git pull origin develop

# 2. Cut a feature branch including the issue number
git checkout -b feat/16-athletes-list

# 3. TDD cycle: failing test → implementation → refactor, small atomic commits
git commit -m "test(athletes): add pest feature test for list endpoint"
git commit -m "feat(athletes): implement athlete list with belt/status filters"
git commit -m "test(e2e): add cypress spec for athletes page navigation"

# 4. Keep up to date with develop via merge (no rebase)
git fetch origin && git merge origin/develop

# 5. Run pre-push gates locally before opening the PR
./.claude/scripts/test-server.sh   # if PHP files changed
./.claude/scripts/test-client.sh   # if Angular files changed

# 6. Push and open PR → develop
```

## Commit messages — Angular Conventional Commits

```
<type>(<scope>): <short description in imperative mood, lower-case>

[optional body — explain WHY, not what]

[optional footer: BREAKING CHANGE: ..., closes #issue]
```

The **subject must be lower-case**. Commitlint enforces this via Husky pre-commit hook.

Examples:

- `feat(auth): add jwt refresh token endpoint`
- `fix(athletes): handle duplicate email on create`
- `test(e2e): add cypress spec for setup redirect guard`
- `chore(docker): add production build script`
- `refactor(athletes): extract list logic into a dedicated action`

## Hotfix flow

Hotfixes are cut from `main` (not `develop`) so they can ship without waiting for whatever else is on the integration branch:

```bash
# 1. Cut from main
git checkout main && git pull origin main
git checkout -b hotfix/31-token-expiry-crash

# 2. Write test, fix, commit
git commit -m "fix(auth): prevent crash on expired token decode"

# 3. PR → main (semantic-release tags the new stable automatically)
# 4. Backport: second PR → develop to keep branches in sync
```

The backport PR is mandatory — without it `develop` lags behind `main` and the next beta cut diverges.

## Merge style

- **Squash merge** into `develop` — one clean commit per feature, one squash subject per PR.
- **Merge commit** (no squash) from `develop` into `main` — preserves the semantic-release tag points and keeps the merge bookkeeping correct.
- Delete the branch after merge.

No direct commits to `main` or `develop` — ever, not even for hotfixes.

## Keeping the feature branch up to date

When `develop` moves ahead and the feature branch falls behind: **merge `develop` in, don't rebase**.

```bash
git fetch origin
git merge origin/develop
```

The feature branch's own history can carry merge commits — they all collapse into a single commit at squash-merge time. No force-push gymnastics, no IDE confusion. GitHub's "Update branch" button does the right thing by default.

## Pre-push gates

Both gate suites run inside Docker containers via wrappers under `.claude/scripts/`:

```bash
./.claude/scripts/test-server.sh        # cs-fixer + phpstan + pest
./.claude/scripts/test-client.sh        # prettier --write + lint + vitest
```

Subcommands: `all` (default), `quick` (skip `--write` formatters when re-running mid-session), or any individual gate name (`pest`, `phpstan`, `vitest`, `lint`, …).

Run formatters/fixers **before staging** so fixed files are included in the commit. Run static analysis / lint **after staging** to verify the final state. Never rely on CI to catch these — fix locally first.

Cypress E2E specs need `ng serve` running and are validated in CI. Run `npm run cy:open` locally (`docker exec -it budojo_client …`) to debug a specific spec.

## GitHub Project board moves

The board lives at the [`org-level project number 2`](https://github.com/orgs/Budojo/projects/2). Issues are the primary items; PRs are added alongside them so the connection is visible directly on the board.

Status lifecycle:

| Status        | When                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `Todo`        | Issue created                                                                     |
| `In Progress` | PR opened (set on both the issue item AND the PR item)                            |
| `Merged`      | PR merged to `develop` — the PR item moves; the issue item stays in `In Progress` |
| `Done`        | The next `develop → main` release PR is merged — GitHub auto-closes the issue     |

Use `./.claude/scripts/board-set.sh <N> <status>` to set the status — it encapsulates the 3-step GraphQL pipeline (lookup node id, add to project, set field). Acceptable status values: `todo`, `in-progress`, `done`.

## Markdown gotcha: never write `Project #N`

`#N` on GitHub-rendered markdown (PR bodies, READMEs, this file) auto-links to issue/PR N in the current repo. Use the explicit URL form (`[/orgs/Budojo/projects/N](URL)`) or "project number N" or "the org-level project" — anything but the bare `#N`. First caught on PR #328's body.
