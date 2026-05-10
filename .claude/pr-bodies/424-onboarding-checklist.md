## What

A self-gated 5-row "Getting started" checklist at the top of `/dashboard/athletes` (the dashboard default landing). Walks a fresh owner through the five canonical actions — add an athlete, log attendance, mark a payment, upload a document, view stats — with a "Show me" CTA per row that navigates to the corresponding feature AND marks the step complete in one call. A dismiss link retires the card permanently after a confirm-popup gate.

## Why

After registration + academy setup the user lands on an empty roster with no orientation. First-session abandonment is the known SaaS conversion killer. The issue asked for a guided tour overlay + persistent checklist; this PR ships the checklist (the highest-value half — discoverable, idempotent, doesn't pre-empt the UI).

## How

**Server (Laravel 13)**

- Migration adds two nullable columns on `users`: `onboarding_dismissed_at` (timestamp) + `onboarding_completed_steps` (JSON array). Both expose the user's first-run state without touching every other column on the table.
- `App\Support\OnboardingStep` — single source of truth for the 5 step keys. The request validator uses `OnboardingStep::all()` as a `Rule::in(...)` allowlist; the SPA's `ONBOARDING_STEPS` const mirrors it; a vitest spec pins parity.
- `OnboardingController` surfaces 3 endpoints under `/me/onboarding`:
  - `GET` → current state snapshot (dismissed_at, completed_steps, available_steps).
  - `POST /steps` → mark a step complete. Idempotent (re-posting is a no-op).
  - `POST /dismiss` → stamp the timestamp once; re-dismiss is a no-op.

**Client (Angular 21 + PrimeNG 21)**

- `OnboardingService` — Signal-backed state, hydrated by the dashboard on first visit. Exposes `tourActive` / `checklistVisible` / `progress` computeds. Components subscribe directly, no `BehaviorSubject` boilerplate.
- `OnboardingChecklistComponent` — self-gated card; renders only when the user hasn't dismissed AND any step is still pending. Each row has a status icon (check / pending dot), the step label + hint, and a "Show me" CTA. Clicking the CTA navigates to the feature AND fires `completeStep` in the same handler. Dismiss CTA goes through a `p-confirm-popup` because the action is irreversible from the UI.
- Wired into `AthletesListComponent`.
- i18n full EN+IT lockstep — checklist chrome + per-step labels and hints. Static map of step → translation key to keep the parity spec able to see every key.

**Docs**

- `docs/api/v1.yaml` — 3 new operations.
- `docs/entities/user.md` — two new columns + endpoint references.

## Notes

- Tour overlay (the modal that walks through the same five steps step-by-step) is deferred to a follow-up — the persistent checklist already delivers the orientation value without an interrupt-modal that the literature consistently shows getting dismissed without read.
- The dismissed-at column is irreversible from the SPA. A future "show me the tour again" admin surface can flip it back to null.
- The component is self-gated — adding the `<app-onboarding-checklist />` tag anywhere it might fit later (dashboard home, etc.) is safe.

## Out of scope

- The full guided-tour overlay (separate, lower-priority follow-up).
- Personalised onboarding by user role (multi-user umbrella).
- A/B testing the copy.

## References

- Closes #424

## Test plan

- [x] `vendor/bin/pest tests/Feature/Onboarding` — 6 specs green (23 assertions).
- [x] `vendor/bin/phpstan analyse --memory-limit=1G` — clean at level 9.
- [x] `vendor/bin/php-cs-fixer fix` — no drift.
- [x] `npm test -- --watch=false` — 769 specs green (763 baseline + 6 onboarding service).
- [x] `npm run lint` — clean.
- [ ] Cypress E2E (3 specs) green in CI.
- [ ] Manual smoke on a fresh owner account: checklist renders, click navigates + ticks the row, dismiss confirms + hides.
