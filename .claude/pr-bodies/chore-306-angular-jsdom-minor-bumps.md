## What

Picks up the safe end of the deferred dep bumps from #306 — Angular ecosystem moves from 21.2.7/21.2.9 → 21.2.9/21.2.11 (minor across runtime + build tooling), and `jsdom` 28.x → 29.1.1 (used by Vitest only).

## Why

#306 enumerated five deferred majors/minors. Re-auditing today, the Angular ecosystem block called out in the issue body ("`@angular/build`, `@angular/cdk`, `@angular/cli` latest is still 21.2.9") is now resolved — those packages have published 21.2.9, so the runtime can move to 21.2.11 without breaking peer-deps.

Bringing both forward de-risks the upcoming `v1.13.0` release (after this PR ships) by getting us onto the latest patch+minor train across the front-end runtime, eslint plugins, and the test environment.

## How

`client/package.json`:

```diff
   "@angular/animations": "^21.2.11",
   "@angular/cdk": "^21.2.9",
-  "@angular/common": "^21.2.0",
+  "@angular/common": "^21.2.11",
   ... (every @angular/* runtime package bumped to ^21.2.11)
-  "@angular/service-worker": "21.2.9",
+  "@angular/service-worker": "21.2.11",

   "@angular/build": "^21.2.9",
   "@angular/cli": "^21.2.9",
   "@angular/compiler-cli": "^21.2.11",
-  "jsdom": "^28.0.0",
+  "jsdom": "^29.1.1",
```

`package-lock.json` regenerated from scratch (`rm package-lock.json && npm install`) — necessary because the cached lockfile pinned some peer-conflicting older versions and a partial bump was rejected by npm's resolver. The new lockfile resolves cleanly with no `--legacy-peer-deps` / `--force` workarounds.

## Out of scope (still deferred from #306)

| Package | Why deferred this round |
|---|---|
| `cypress` 13.17 → 15.14 | Skipped a major (14). Needs careful E2E retest including the multi-viewport helpers (#240). Worth its own focused PR. |
| `typescript` 5.9.3 → 6.0.3 | Angular 21's TS support matrix officially tops out at TS 5.x; TS 6 may not be supported yet. Verify Angular's compatibility statement first; until then, stay on 5.9. |
| `phpunit` 12.5 → 13.1 | Transitively pinned by `pestphp/pest@4.6.3`; bumping in our own composer.json doesn't help — pest controls the version. Wait for pest 5.x or whichever release moves to phpunit 13. |

These three remain on #306 (which stays open after this PR).

## References

- Part of #306 (the issue stays open for the three deferred items above)
- No code changes — only `package.json` + `package-lock.json`

## Test plan

- [ ] CI green on the PR (vitest 420/420 + ESLint + Cypress + the PHP gates)
- [x] Local `npm install` resolves cleanly (no `--force` needed)
- [x] `npm test -- --watch=false` → 46/46 test files, 420/420 tests pass on the new versions
- [x] `npm run lint` → All files pass linting
- [x] `npx ng build` → Application bundle generated successfully (only the pre-existing landing/dashboard CSS budget warnings, no new ones)
- [ ] Cypress E2E sweep on CI (no local `ng serve` here)
