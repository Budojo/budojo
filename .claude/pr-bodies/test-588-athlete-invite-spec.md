## What

Adds the missing Vitest spec for `AthleteInviteComponent`. Fifth slice of the umbrella issue #588.

8 tests covering the full state machine + form lifecycle:

1. `ngOnInit` with a valid token → calls `preview()` and flips `state` to `'ready'`, populates the `preview()` signal.
2. `ngOnInit` with no token in the URL → flips `state` to `'invalid'` without touching the service.
3. `ngOnInit` with a preview error (404 / 410 — revoked / expired / unknown / consumed token) → flips `state` to `'invalid'`.
4. `submit()` with an invalid form → marks all touched and does NOT call `accept()`.
5. `submit()` with a mismatched `password` / `password_confirmation` → form carries the `mismatch` validator error; no `accept()` call.
6. `submit()` on success → calls `accept()`, then `auth.adoptIssuedToken(token)`, then navigates to `/athlete-portal/welcome`.
7. `submit()` on a server error with a known code (e.g. `invite_revoked` in `error.errors.token[0]`) → flips `state` to `'error'`, surfaces the code in `errorMessage()`.
8. `submit()` on a server error WITHOUT the expected error-shape → falls back to `'unknown_error'`.

Part of #588 (umbrella). Pairs with PRs #589, #590, #591, #592.

## Why

`AthleteInviteComponent` is the most complex of #588's untested components (159 LOC, 5-state machine + reactive form + form-level cross-field validator + token-in-URL auth flow + adopt-issued-token sanctum landing). The state machine carries non-trivial branches (loading / invalid / ready / submitting / error) and the form-level `passwordsMatch` validator was previously untested at the unit level — Cypress covers the happy-path accept flow but the error-shape branches and the form-mismatch guard aren't reachable from a headless Chrome end-to-end run.

## How

Standard pattern from this session's other #588 PRs. `ActivatedRoute` mocked via `convertToParamMap(...)` — three variants in the setup helper (default valid 64-char token, missing token, custom token string). `AthleteInviteService.preview` + `.accept` are `vi.fn(() => of(...))` mocks with throw-error variants for the failure branches. `AuthService.adoptIssuedToken` and `Router.navigate` mocked similarly. `provideI18nTesting()` for the `| translate` pipe.

Form filled via `cmp.form.patchValue(...)` (Reactive Forms) before each submit-path test, so the validator state is exercised without relying on template-driven DOM input events.

## Out of scope

- Cypress E2E for the accept flow — already covered separately.
- Refactoring `AthleteInviteComponent`'s state machine into a discriminated-union signal (the current 5-state string is fine; a refactor is a separate concern).
- The remaining 3 components in #588: onboarding-checklist, setup, profile-api-tokens.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 97 spec files (+1), 810 tests (+8)
- [x] Cold-cache rerun — same totals confirmed
- [ ] CI green

## Provenance

Same coverage-gap audit (#588). Fifth of 7 slices, ordered by complexity — this is the second-most complex after `setup` (which lands in the next slice).
