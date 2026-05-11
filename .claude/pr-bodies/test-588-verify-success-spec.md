## What

Adds the missing Vitest spec for `VerifySuccessComponent`. First slice of the umbrella issue #588 (8 untested components → 1 spec per PR).

5 tests covering:

1. `loadCurrentUser()` fires when a Sanctum token sits in localStorage (existing-session verify-click case).
2. `loadCurrentUser()` is skipped when no token is present (cross-device verify-click case).
3. Auto-redirect to `/dashboard/athletes` fires at exactly `AUTO_REDIRECT_MS` (3000 ms) — fake timers exercise the boundary.
4. Manual `goToDashboard()` cancels the pending auto-redirect timer (#173 follow-up — without this, a manual click followed by navigation elsewhere yanks the user back).
5. `ngOnDestroy` clears the timeout so a fast unmount doesn't navigate.

Closes part of #588 (verify-success only — verify-error and the other 6 components ship as separate PRs).

## Why

The umbrella issue (#588) documents the scope and rationale. Short version: 8 production Angular components ship without Vitest specs; refactors of any of them rely entirely on Cypress smoke + manual eyeballing. PR #582 (the `<app-verify-page>` extract) went through the family of 3 verify components with only 1 of them spec-covered. This PR closes that gap for the smallest of the three.

## How

`provideI18nTesting()` for the `| translate` pipe in the template (delegated to `<app-verify-page>`). `AuthService.getToken` + `loadCurrentUser` mocked as `useValue` provider; `Router.navigateByUrl` mocked similarly. `vi.useFakeTimers()` for the redirect timer assertions. `EMPTY` from rxjs as the `loadCurrentUser()` return — the component subscribes only to catch errors, the success path is irrelevant to the test, and `Observable<never>` is type-compatible with the declared `Observable<User>` return.

## Out of scope

- `VerifyErrorComponent` spec (more branches: canResend, resend success/429/401/other-error, goToLogin) — next slice of #588.
- The other 6 components in #588's table — one PR each.
- Cypress E2E for verify-success — currently uncovered there too; separate question.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 95 spec files (+1), 799 tests (+5)
- [x] Cold-cache rerun (`rm -rf .angular/cache node_modules/.vite`) — same totals confirmed
- [ ] CI green (prettier + lint + vitest + cypress + the PHP / OpenAPI / Worker jobs that don't touch this area)

## Provenance

Spec-coverage gap surfaced during the post-#580 cleanup audit (umbrella issue #588). First of 8 planned slices, ordered cheapest-first.
