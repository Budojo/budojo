---
description: Cut a stable release (develop → main). Computes the version from the commits, writes the user-facing changelog + whats-new entry, opens the release PR with the mandatory Auto-closes block, and verifies the installers land on the GitHub Release.
argument-hint: '[--dry-run]'
---

# /release

Run the full `develop → main` stable-release sequence from [`docs/development/release-flow.md`](../../docs/development/release-flow.md). This exists because the sequence is long, ordered, and every step has a trap that has actually bitten — the notes below are failures we have already paid for.

**Merging the release PR ships installers to users.** Confirm with the user before the merge step unless they have already said to go ahead in this conversation. `--dry-run` stops after the release PR is opened.

## Steps

### 1. Compute the version FIRST

```bash
git fetch origin
git tag --list 'v*' --sort=-v:refname | grep -vE 'beta' | head -1   # last stable
git log --oneline origin/main..origin/develop
git log --format='%s' origin/main..origin/develop | grep -oE '^[a-z]+' | sort | uniq -c
```

Angular preset: any `feat` → **minor**; only `fix` → **patch**; only `chore`/`docs`/`ci`/`test`/`refactor` → **no release, stop and say so**. `BREAKING CHANGE:` footer → major.

> **Trap:** the changelog filename and the whats-new entry must match the version semantic-release will actually tag. Computing it after writing the files is how v2.18.5/v2.19.0 drifted.

### 2. Changelog + whats-new, in lock-step

On a `chore/release-vX.Y.Z` branch off develop:

- `docs/changelog/user-facing/vX.Y.Z.md` — plain English for an instructor, not a developer. Describe what changed *for them*; CI/infra work is invisible and belongs nowhere in this file.
- **Prepend** a `Release` entry to `RELEASES` in `client/src/app/features/whats-new/whats-new.releases.ts` (newest first).
- Bump the three trip-wires in `whats-new.component.spec.ts`: the latest-version assertion, `cards.length`, and the head of the `versions` array.

Run `test-client.sh vitest` on that spec, open the PR to **develop**, merge it. The dedicated `Whats-new pin matches expected release` CI job gates this.

### 3. Build the `## Auto-closes` block

```bash
prs=$(git log --oneline origin/main..origin/develop | grep -oE '\(#[0-9]+\)' | grep -oE '[0-9]+' | sort -un)
for p in $prs; do gh pr view "$p" --json body -q .body \
  | grep -oiE '(clos|fix|resolv)[a-z]* #[0-9]+' | grep -oE '#[0-9]+'; done | sort -t'#' -k2 -un
```

Every issue that list yields goes into a `## Auto-closes` block at the end of the release PR body: `Closes #N1, #N2, …`.

> **Trap:** GitHub only auto-closes from a PR merged into the **default branch**. Feature PRs target `develop`, so their own `Closes #N` never fires. Without this block the leaf issues stay open forever. Verify afterwards (step 6) — a long list occasionally drops one.

### 4. Open the release PR

`gh pr create --base main --head develop --body-file .claude/pr-bodies/release-vX.Y.Z.md --assignee m-bonanno`, with the merge-style warning at the top of the body. Wait for **all** checks green.

Stop here on `--dry-run`.

### 5. Merge with a MERGE COMMIT — never squash

```bash
gh pr merge <N> --merge        # NOT --squash, and do NOT --delete-branch (develop is protected)
```

> **Trap:** squashing erases the parent linkage and breaks the post-release `main → develop` sweep.

### 6. Verify what the merge actually produced

Do not assume; check:

```bash
gh run list --workflow=release.yml --branch main --limit 1     # then poll the run
gh release view vX.Y.Z --json assets -q '.assets[].name'       # installers attached?
gh issue view <each-auto-closed-issue> --json state -q .state  # CLOSED?
gh pr list --base develop --state all --limit 3                # sweep PR opened + merged?
```

The run has three jobs: **Semantic Release**, **sweep**, **Desktop installer (Windows)**. A green tag with a failed installer job means the release shipped with nothing to download — fix forward and re-run the installer for the existing tag:

```bash
gh workflow run release.yml --ref develop -f installer_tag=vX.Y.Z
```

> **Trap:** the installer job checks out the **tag's** source, so a fix committed to develop *after* the tag is not present when rebuilding that tag — only workflow-level fixes apply. Fix in `release.yml` itself when backfilling.

Close any auto-close stragglers by hand with a comment saying which release delivered them.

### 7. Post-release sweep

Mandatory, and an empty result is a valid outcome. Branch `chore/techdebt-sweep-vX.Y.Z` off develop after the sync PR merges and walk the checklist in [`release-flow.md`](../../docs/development/release-flow.md#post-release-tech-debt--docscode-cleanup-sweep): TODO/FIXME markers, suppressions, `.only`/`.skip`, `npm outdated` + `composer outdated`, doc drift, gotchas, memory index, stale board items.

## Notes

- Never push to `main` or `develop` directly at any point — every artefact lands through a PR.
- `package.json` never gets a `version` field; semantic-release owns versioning and CI injects the version into the installer with `-c.extraMetadata.version`.
- Report each step's real outcome (tag, asset names, closed issues) rather than a summary of intent — the point of steps 6 and 7 is that "the workflow was green" is not the same as "users can download it".
