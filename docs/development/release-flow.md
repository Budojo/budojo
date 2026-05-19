# Release flow

Versioning, changelogs, and Git tags are fully automated via **semantic-release** — no manual tagging or version bumps, ever. Config: `.releaserc.json` at the repo root.

## Beta releases

Every squash merge to `develop` triggers a beta release:

1. semantic-release reads conventional commits since the last tag.
2. Determines the version bump: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` footer → major.
3. Creates tag `vX.Y.Z-beta.N` + a GitHub pre-release whose body **is** the rendered changelog.

## Stable releases

Every merge commit from `develop` → `main` triggers a stable release:

1. semantic-release reads conventional commits since the last stable tag.
2. Creates tag `vX.Y.Z` + GitHub Release with the full changelog as the body.

There is **no `CHANGELOG.md`** in the repo — the GitHub Releases page is the source of truth. The `@semantic-release/changelog` + `@semantic-release/git` plugins were dropped after the develop branch ruleset rejected the bot's auto-commit (see `.claude/gotchas.md` § GitHub Actions).

## Package.json discipline

- Do **not** create a `version` field — semantic-release owns versioning entirely.
- `package-lock.json` is committed; always run `npm install` after changing `package.json`.

## `## Auto-closes` block — mandatory on every release PR

Every `develop → main` release PR body MUST end with an `## Auto-closes` block listing each sub-issue resolved:

```markdown
## Auto-closes

Closes #N1, #N2, #N3, …
```

GitHub auto-closes those issues the moment the release PR is merged. Without this block they stay open forever, because:

- GitHub's auto-close fires only when a PR with `Closes #N` is merged into the repo's **default branch** (`main`).
- Feature PRs target `develop`, not `main`, so their `Closes #N` references never fire.
- The release PR (develop → main) IS merged to `main`, but its own body doesn't carry the sub-issue references unless we add them — squash commits of sub-PRs carry only `(#PR_N)` in their subject lines, which is a reference and not a close keyword.

### How to build the block when opening the release PR

1. Walk the squash commits between `main..develop`.
2. For each squash subject that includes a `(#PR_N)` reference (any conventional-commit type: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, …), pick up the PR body:
   ```bash
   gh pr view <PR_N> --json body
   ```
3. Grep its body for `Closes #M` / `Fixes #M` / `Resolves #M`.
4. Aggregate every `#M` into the release PR body's `## Auto-closes` block.
5. `gh pr create --body-file …`. The user only clicks Merge; GitHub closes the listed issues.

### Corollary on every sub-PR

Each feature / fix / chore PR body MUST contain an explicit `Closes #N` referencing the leaf issue it ships. `Closes part of #EPIC` doesn't satisfy GitHub's auto-close keyword set — write **both**:

- `Closes #N` for the leaf issue.
- A separate sentence pointing at the umbrella epic ("Part of the M5 push-notifications epic — see #ABC").

## Auto-sweep main → develop after a stable release

After every stable release, a sweep PR brings the merge commit back into `develop` so semantic-release reads the right base on the next push. Without it, develop's next beta tag stays on the OLD train.

The sweep is wired into `.github/workflows/release.yml` as a **downstream job in the same Release workflow run** as semantic-release. (Originally it was a separate workflow on `release: published`, then on `push: tags:` — both silently no-op'd because GitHub Actions refuses to fire downstream workflows on events created by `GITHUB_TOKEN`. Living in the same workflow run sidesteps the recursion guard.)

### Repo setting prerequisite

*Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"* must be **enabled**. Without it, `gh pr create` from the sweep job fails with `GitHub Actions is not permitted to create or approve pull requests`. One-time admin toggle.

### End-to-end auto-merge (optional)

Requires `BUDOJO_BOT_TOKEN` PAT secret + the repo "Allow auto-merge" toggle:

- The sweep job authors the `git push` and `gh pr create` with the bot identity. This fires `pr-checks.yml` on the resulting PR (the recursion guard that suppresses `GITHUB_TOKEN` events does NOT suppress PAT events).
- The job then calls `gh pr merge --auto`, so the sweep merges itself the moment CI is green.
- Required PAT scopes: **Contents: write**, **Pull requests: write**, **Issues: write** (the last because `gh pr create --label --assignee` goes through the Issues API).
- Required repo setting: *Settings → General → Pull Requests → "Allow auto-merge"* must be enabled (without it `gh pr merge --auto` returns an `enablePullRequestAutoMerge` GraphQL error).
- The auto-merge step is non-fatal — if either is missing it logs `::warning::` and the sweep falls back to manual-merge.

### Manual fallback

If the auto sweep ever misfires, open the sweep PR by hand from a `chore/sync-main-into-develop-after-vX.Y.Z` branch cut from the release tag, base = `develop`. The body template lives in `.github/workflows/release.yml` § sweep job.

### Sweep merges immediately

The post-release `main → develop` sweep PR merges immediately — it's alignment-only and has no business logic. It does NOT wait for the Claude reviewer pass (per `feedback_post_push_reviewer_dance` in agent memory § Exceptions).

## User-facing changelog (#254)

Separately from the semantic-release dev changelog, the SPA ships a **user-facing changelog** at `/dashboard/whats-new` in plain English for non-technical customers. Two artefacts kept in lock-step by hand:

- `docs/changelog/user-facing/v{X.Y.Z}.md` — markdown source, one file per stable release, light emoji on section headings.
- The `releases` array in `client/src/app/features/whats-new/whats-new.component.ts` — typed `Release[]` rendered via Angular template (no markdown parser dependency).

**Discipline:** every `develop → main` release PR adds the markdown file AND prepends the array entry in the same commit history. The vitest spec pinning the version order in the array (`renders all four backfilled releases`) fails when one is missing — that's the regression-catching trip-wire, by design.

**Compute the version BEFORE writing the file.** Angular preset rules:

- Any `feat:` commit in `main..develop` → next bump is **minor** (`vX.(Y+1).0`).
- Only `fix:` commits → **patch** (`vX.Y.(Z+1)`).
- Anything else (only `chore`, `docs`, `ci`, `test`, `refactor`) → **no bump** — no release.

Scan the commits first; the whats-new file name + Release entry version MUST match what semantic-release will actually tag. (Missed on v2.18.5/v2.19.0 mismatch — caught after the fact.)

## Post-release tech-debt + docs/code cleanup sweep

After every stable release — that is: release PR (`develop → main`) merged, semantic-release tag published on `main`, AND the post-release `main → develop` sync PR merged — open a `chore/techdebt-sweep-v{X.Y.Z}` branch from `develop` and run the canonical checklist:

- **Code-level**: every `TODO` / `FIXME` / `XXX` / `HACK`, every `@ts-expect-error` / `@ts-ignore` / `eslint-disable`, every stray `console.log` / `console.debug`, every `.skip` / `.only` / `.todo` test marker. `npm outdated` (under `client/`) + `composer outdated` (under `server/`). Walk `client/src/app/app.routes.ts` for dead routes.
- **Docs-level**: `docs/entities/*.md` against migrations since last tag, `docs/api/v1.yaml` against controller / resource / form-request changes, `docs/design/DESIGN_SYSTEM.md` against `client/src/styles/budojo-theme.scss`, `client/CLAUDE.md` + `server/CLAUDE.md` + root `CLAUDE.md` for stale file paths / route names, `.claude/gotchas.md` for stale rules, every `README.md` for stale quick-start commands.
- **Agent-memory-level**: the agent maintains a memory index file in its own memory directory (NOT in this repo) — the sweep makes sure the index reflects every memory file present, and each `description` accurately summarises its content.
- **Project-board**: stale issues (>90d no activity), umbrella issues carry honest current-state snapshots.

The sweep is **not optional**, but finding nothing IS a valid outcome — an empty sweep that documents "checked everything, nothing to do" is a successful sweep. Squash-merge to develop; chore commits don't bump version. Findings that require real code change beyond hygiene (real bugs, missing tests, doc rewrites) get their own follow-up issue and a stub pointer in the sweep PR.

## Workflow changes need an immediate release

Any merge to `develop` that touches `.github/workflows/pr-claude-review.yml` or the pr-code-reviewer subagent prompt breaks the reviewer on every subsequent PR until shipped to `main`. The release PR is the **next bash**, not a future action.
