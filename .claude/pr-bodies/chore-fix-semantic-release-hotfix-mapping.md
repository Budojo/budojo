## What

Tells semantic-release that `hotfix:` commits should bump the patch version, by adding a `releaseRules` entry to `@semantic-release/commit-analyzer` in `.releaserc.json`.

## Why

There was config drift between commitlint and semantic-release:

- `commitlint.config.js` accepts `hotfix` as a valid commit type
- `.releaserc.json` used the default `@semantic-release/commit-analyzer` (angular preset) which only recognizes `feat:` (minor), `fix:` (patch), `perf:` (patch), and `BREAKING CHANGE:` (major)

So `hotfix(scope): ...` commits were silently ignored by semantic-release. Caught by PR #347 (`hotfix/346-cloudflare-wrangler-config`): merged to `main` with a `hotfix(deploy):` subject, no `v1.12.1` tag was created, and the post-release sweep job was skipped (its trigger is "new stable tag at HEAD"). The release flow only unblocked when PR #349 used `fix(deploy):` instead.

The drift was hidden because `hotfix/*` branches had been rare. Now that they're a documented part of the workflow (CLAUDE.md § Hotfix Flow), the rule needs to fire.

## How

Replace the bare plugin string with a tuple carrying the config:

```diff
   "plugins": [
-    "@semantic-release/commit-analyzer",
+    [
+      "@semantic-release/commit-analyzer",
+      {
+        "preset": "angular",
+        "releaseRules": [
+          { "type": "hotfix", "release": "patch" }
+        ]
+      }
+    ],
     "@semantic-release/release-notes-generator",
     "@semantic-release/github"
   ]
```

`releaseRules` are applied AFTER the preset's defaults, so existing `feat:`/`fix:`/`perf:` behavior is unchanged. Only adds: `hotfix` → patch.

## Out of scope

- **Hotfix visibility in changelog body.** The angular preset's `writerOpts.transform` filters out commit types not in its hardcoded list. So even after this fix, hotfix commits won't appear under any section of the auto-generated release notes body. The version bump and GitHub release WILL happen — only the per-commit grouping in the body is missing. If we want hotfixes visibly listed, a follow-up needs to switch to the `conventionalcommits` preset (adds `conventional-changelog-conventionalcommits` as a dep) and add a `presetConfig.types` mapping. Acceptable for now — hotfixes are infrastructure-level and the merge commit subject is in the release notes anyway.
- Adding mappings for other commitlint types not in the angular preset (`refactor`, `test`, `chore`, `docs`, `style`, `ci`, `release`, `revert`). Those are correctly excluded today (they shouldn't bump the version), and `revert` is handled natively by the angular preset's commit-parser.

## References

- Closes #351
- Discovered while shipping #347 / #349 (the wrangler.jsonc + `_redirects` fix that unblocked the Cloudflare deploy)

## Test plan

- [ ] CI green on the PR
- [ ] After merge, the next `hotfix(...)` commit landing on `develop` produces a beta tag (`vX.Y.Z-beta.N`) — verifiable on the next hotfix-on-develop, hard to demonstrate synthetically without a real hotfix commit
- [ ] Existing `feat:` / `fix:` / `perf:` commits still trigger the same release-type they did before (no regression)
