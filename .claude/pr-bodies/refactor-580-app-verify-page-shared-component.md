## What

Extracts the chrome shared by the three token-verification landing pages into a single `<app-verify-page>` standalone component:

- `client/src/app/shared/components/verify-page/` — new shared component (template + scss + spec).
- `verify-success`, `verify-error`, `verify-email-change` — refactored to delegate the outer flex + state-coloured icon + title/message/hint to the shared component. Their state machines, CTAs, and routing stay in the feature components.

Closes #580.

## Why

The three verify components shared near-identical SCSS (variation: 1–23 lines for the icon-colour modifier) and a near-identical HTML chrome (`.verify-page` flex container, `__icon` slot, `__title` / `__message` / `__hint`). The `semantically_similar_to` edges flagged by `/graphify` (score 0.85+) put the duplication at 99 lines of SCSS and ~30 lines of HTML chrome across the three.

After the refactor:

- The chrome lives in one component with **its own Vitest coverage** (previously the chrome existed in three files, two of which had no spec at all — `verify-success` and `verify-error` had zero tests covering layout or icon state).
- Future verify-style landings (M7 athlete-invite verify, eventual password-reset-confirm, etc.) cost ~10 lines of consumer template instead of 60+, and inherit any chrome improvement automatically.
- Visual contract is centralised: any layout / icon-colour / spacing change to the verify pages becomes a single-file edit.

## How

### Shared component API

```html
<app-verify-page
  [state]="'loading' | 'success' | 'error' | 'neutral'"
  [iconClass]="'pi pi-check-circle'"   <!-- ignored when state='loading' -->
  [titleKey]="'auth.verifySuccess.title'"
  [titleDataCy]="'verify-email-change-success'"  <!-- optional, for Cypress hooks -->
  [messageKey]="'auth.verifySuccess.message'"    <!-- optional -->
  [hintKey]="'auth.verifySuccess.hint'"          <!-- optional -->
  [hintDataCy]="'verify-email-change-redirect-hint'"  <!-- optional -->
>
  <p-button … data-cy="verify-success-go" />     <!-- CTA(s) via ng-content -->
</app-verify-page>
```

- `state` drives the icon-modifier class (`__icon--success` / `__icon--error`) and swaps the icon out for a `<p-progress-spinner>` when `loading`.
- `iconClass` is the pi icon string; `null` + `state='neutral'` omits the icon block entirely.
- `titleKey` is the only required content input — the message and hint are optional.
- `titleDataCy` and `hintDataCy` preserve the existing per-state Cypress hooks for `verify-email-change` (the only consumer that needs to differentiate by state via `data-cy`).
- The CTA(s) come via `<ng-content>` so each consumer keeps its own state-machine and routing logic.

### Per-consumer changes

| Consumer | Before | After | Notes |
|---|---|---|---|
| `verify-success` | 15-line HTML + 33-line SCSS | 15-line HTML (delegates to shared), 0 SCSS | `goToDashboard()` stays; auto-redirect timer stays |
| `verify-error` | 29-line HTML + 33-line SCSS | 26-line HTML (delegates to shared), 0 SCSS | `canResend` branching for message + CTA stays; resend handler + 429/401 branches stay |
| `verify-email-change` | 52-line HTML + 51-line SCSS | 31-line HTML (delegates to shared) + 6 `computed()` signals in TS, 0 SCSS | 3-state machine (loading/success/error) stays in the feature component; `titleKey`/`titleDataCy`/`iconClass`/`messageKey`/`hintKey`/`hintDataCy` derived via computed() from `state()` |

### Test parity

- All existing `data-cy` selectors (`verify-success-go`, `verify-error-resend`, `verify-error-login`, `verify-email-change-success`, `verify-email-change-error`, `verify-email-change-cta-login`, `verify-email-change-cta-profile`, plus the lesser-used `verify-email-change-loading` and `verify-email-change-redirect-hint`) are preserved at the same DOM positions.
- The existing `verify-email-change.component.spec.ts` continues to assert on those selectors and passes unchanged.
- New `verify-page.component.spec.ts` covers the shared chrome — icon state→modifier mapping, loading→spinner branch, optional message/hint rendering, data-cy pass-through.

## Notes

- **LOC delta is roughly flat** (~+5 net), not the 30% reduction the issue body initially estimated. Where the value lives now: single source of truth for chrome + first-time test coverage of the chrome (was untested in 2/3 consumers) + cheap onboarding for the next verify-style page.
- **No visual smoke from this session** — the SPA dev server wasn't reachable from my tooling, so the verification is the Vitest DOM-shape coverage + Cypress's existing `verify-email-change` flow + manual eye on the next deploy. Disclosed honestly per the project's `visual_verification_ui` rule. The risk surface is "chrome looks broken" (icon doesn't render, spinner mis-sized) — Vitest's DOM checks substitute for the small set of binary outcomes here, but worth eyeballing once on staging.
- **`verify-page.component.html` template owns the icon `state`-modifier classes via `[class.foo]` bindings** rather than via `[ngClass]` + `CommonModule` — keeps the shared component's imports minimal (`ProgressSpinnerModule` + `TranslatePipe`).
- **i18n keys are untouched.** No copy moves, no new translation keys, no en/it lock-step concern.

## Out of scope

- Restyling verify pages (this is a code-shape refactor, no visual changes intended).
- Extending `<app-verify-page>` to non-auth verify flows (e.g. a hypothetical future `/onboarding/verify-checklist`) — wait for the real second-use signal.

## Test plan

- [x] `prettier --write` — clean
- [x] `npm run lint` — `All files pass linting.`
- [x] `npm test -- --watch=false` — 94 spec files, 793 tests pass (+8 new in verify-page.component.spec.ts)
- [x] Cold-cache rerun (`rm -rf .angular/cache node_modules/.vite`) — same totals confirmed; new spec file is in the runner's manifest
- [x] `verify-email-change.component.spec.ts` (pre-existing) passes unchanged → existing data-cy selectors still wired
- [x] CI green (prettier + lint + vitest + cypress headless E2E + the PHP / OpenAPI / Worker jobs)
- [x] Cypress `email-change.cy.ts` (covers `verify-email-change-success`, `verify-email-change-error`, `verify-email-change-cta-login`) still green via CI

### Post-merge smoke (manual — needed because the SPA wasn't reachable from the dev session)

- Visit `/auth/verify-success` on staging and confirm the green check icon, the H1, the message, and the "Go to dashboard" CTA render correctly and the 3 s auto-redirect fires.
- Visit `/auth/verify-error` and confirm the red times-circle icon, the H1, the canResend branching (logged-in vs logged-out token), and the resend / sign-in CTA render correctly.
- Trigger an email-change verification flow once end-to-end (request → click email → land on `/auth/verify-email-change/:token`) and confirm the loading spinner appears momentarily before flipping to success, then auto-redirects to `/auth/login`.

## Provenance

Surfaced by `/graphify` `semantically_similar_to` edges on PR #578 — the verify components clustered at score 0.85+. Originally I recommended waiting for a 4th verify-style page before extracting (Rule of Three), but with the diagnostic + new chrome test coverage both in this session, the trade became net-positive on its own. The 4th-instance bar moves from "blocking" to "would be even more obviously worth it."


---

### Update — Copilot review addressed in d4a4ace

**Visual regression caught & fixed.** Copilot flagged that pre-#580 `verify-error` used **amber** (`--p-amber-700`) for the icon — semantically a *recoverable* failure (resend / sign in) — while my first cut of `<app-verify-page>` collapsed both `verify-error` and `verify-email-change`'s error branch into a single `error` state with red.

Fix: added a dedicated `'warning'` state on the shared component (amber). The state union is now `'loading' | 'success' | 'error' | 'warning' | 'neutral'`. `verify-error` now uses `state="warning"`; `verify-email-change` keeps `state="error"` for the terminal-token branch.

Updated the "Out of scope" claim — there is no longer a visual change.
