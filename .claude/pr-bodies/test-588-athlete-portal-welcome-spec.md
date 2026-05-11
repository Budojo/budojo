## What

Adds the missing Vitest spec for `AthletePortalWelcomeComponent`. Third slice of the umbrella issue #588.

3 tests covering:

1. Greets the athlete by `full_name` when the cached user is populated — asserts on the `[data-cy="athlete-welcome-title"]` text content.
2. Renders the bare title (no trailing `, …`) when the cached user is `null` — the template's `userName() ? ', ' + userName() : ''` branch.
3. `signOut()` logs the user out (`auth.logout()`) and navigates to `/auth/login`.

Part of #588 (umbrella). Pairs with PR #589 (verify-success) and PR #590 (verify-error).

## Why

This is the smallest of the 8 untested components — single greeting + single CTA — but it's also the M7 athlete-side landing page (#445 PR-D minimal). Future work on PR-E (the real athlete dashboard) is going to delete this component; a 3-test sieve protects the placeholder while it's still load-bearing, and the green CI is what tells us we can safely delete when the time comes.

## How

`signal<User | null>(...)` for the cached user (the component reads `auth.user()?.full_name` via a `computed()`, so the dependency must be a real signal). `AuthService.logout` and `Router.navigate` mocked as `useValue` providers. `provideI18nTesting()` for the `| translate` pipe in the template.

The `auth.user()` signal value flows through `userName = computed(() => …)` → template interpolation. Asserting on the rendered DOM text (`[data-cy="athlete-welcome-title"]`) covers the computed + template + signal chain in one check.

## Out of scope

- Cypress E2E for `/athlete-portal/welcome` — separate question. The route is auth-gated and lives behind a `roleAthleteGuard`, so an E2E spec would need a separate `cy.visitAuthenticated` variant for the athlete role.
- The remaining 5 components in #588 (notification-bell, onboarding-checklist, athlete-invite, setup, profile-api-tokens, plus the umbrella).

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 95 spec files (+1), 797 tests (+3)
- [x] Cold-cache rerun — same totals confirmed
- [ ] CI green

## Provenance

Same coverage-gap audit (#588 + PRs #589 + #590). Third of 7 remaining slices, ordered by complexity — this is the simplest after verify-success.
