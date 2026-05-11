## What

Adds the missing Vitest spec for `VerifyErrorComponent`. Second slice of the umbrella issue #588.

9 tests covering:

1. `canResend === true` when a Sanctum token is in localStorage.
2. `canResend === false` when no token is present (cross-device verify click).
3. `resend()` on 200 OK navigates to `/dashboard/profile` and clears `sending()`.
4. `resend()` on 429 surfaces a `severity: 'warn'` toast and does NOT navigate (throttle hint).
5. `resend()` on 401 navigates to `/auth/login` (stale-token recovery path).
6. `resend()` on a generic non-429-non-401 error surfaces a `severity: 'error'` toast.
7. `resend()` is a no-op when `canResend === false` (template guard hardened from the TS side).
8. `resend()` is a no-op while a previous resend is in flight (re-entrancy guard — covers the same surface as #585's `[loading]` binding from the TS side).
9. `goToLogin()` navigates to `/auth/login`.

Part of #588 (umbrella). Verify-success spec landed in PR #589.

## Why

Same logic as PR #589 — `VerifyErrorComponent` had zero unit coverage despite carrying three error-handling branches (429 / 401 / generic) that Cypress doesn't reach and that a refactor could silently flatten. This spec fixes that for the component as it stands today; the upcoming `email-change.cy.ts` extension (separate ticket) can carry any end-to-end resend flow if/when warranted.

## How

Same shape as the verify-email-change spec: `provideI18nTesting()` for the translate pipe inside the projected `<app-verify-page>`, `useValue` providers for `AuthService` / `Router` / `MessageService`. `HttpErrorResponse` payloads with explicit status codes drive the 429 / 401 / generic branches; `EMPTY` from rxjs simulates an in-flight resend for the re-entrancy assertion.

## Out of scope

- `Cypress E2E` for verify-error — separate question.
- The remaining 6 components in #588 (athlete-invite, athlete-portal-welcome, notification-bell, onboarding-checklist, setup, profile-api-tokens, plus the umbrella).
- Renaming any of the existing `auth.verifyError.toast.*` translation keys to match a cleaner naming (cosmetic, separate concern).

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 95 spec files, 803 tests (+9)
- [x] Cold-cache rerun — same totals confirmed
- [ ] CI green (prettier + lint + vitest + cypress + the PHP / OpenAPI / Worker jobs that don't touch this area)

## Provenance

Same coverage-gap audit that produced #588 + PR #589. Second of 7 remaining slices, ordered by complexity (this one branches more than verify-success, less than setup/onboarding).
