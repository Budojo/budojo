## What

Hotfix `develop`-by-way-of-`main` for the v2.4.0 production deploy failure. Closes #554.

## Why

The Cloudflare Pages production deploy of v2.4.0 failed at `ng build` with TS2367:

```
✘ [ERROR] TS2367: This comparison appears to be unintentional because the types
'"8f4e09f4bf931c69f22acc1aa89e1a9bd085f484"' and '"dev"' have no overlap.

    src/app/core/services/version-check.service.ts:112:8:
      112 │     if (VERSION.sha === DEV_SENTINEL_SHA) {
```

Cause: `VERSION` was declared `as const` so every field had a literal type. Locally and in CI (which build against the committed sentinel `sha: 'dev'`) the runtime check `VERSION.sha === 'dev'` was a literal `'dev' === 'dev'` and compiled fine. The moment the prebuild script wrote the real SHA on the CF Pages deploy, the literal narrowed to `'<full-40-char-sha>'` and the comparison had no overlap → compile fail → no deploy.

Result: tag `v2.4.0` is on `main`, the sweep PR landed, but the CDN is still serving a v2.3.2-era bundle. Users see no v2.4.0 changes until this hotfix ships and re-triggers the build.

## How

`client/src/environments/version.ts` and `client/scripts/write-version.cjs` both moved from `as const` to an explicit `AppVersion` interface with `readonly string` fields. The runtime values stay pinned by the script; only the COMPILE-TIME type widens, so the comparison `VERSION.sha === 'dev'` resolves at runtime and compiles cleanly across local + prod.

Both files emit the same shape so a round-trip through prebuild is type-stable: the committed file declares `interface AppVersion`; the generator re-emits the same interface alongside the const so downstream code can `import type { AppVersion } from './version'` without a separate types module.

## Verification

Ran `npm run build` locally after a fresh prebuild that wrote a real (`0000000…`) SHA into the version file — TS2367 gone, build succeeds, only pre-existing scss-budget warnings remain.

## Closes

- #554

## Merge style

**Merge commit** — this PR targets `main` directly (hotfix flow). semantic-release will tag `v2.4.1` automatically. After this lands, a backport PR `develop ← hotfix/554-…` (or the post-hotfix sweep) brings the same fix into develop so the next minor doesn't ship the broken pattern again.

## Test plan

- [x] `npm test` — 722 specs green
- [x] `npm run build` — TS2367 gone, build succeeds with a real SHA in place
- [ ] After merge: confirm Cloudflare Pages deploy of v2.4.1 lands and the SPA at `https://budojo.it/version.json` reports the new SHA + tag
- [ ] After merge: confirm the existing tabs running v2.4.0-broken get reloaded by the version-check pipeline once they land on the v2.4.1 bundle
