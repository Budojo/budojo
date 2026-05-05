## What

Five small polish fixes Copilot flagged on the v1.17 release PR (#438). Bundling them into a single chore PR so the release train picks them up cleanly without direct commits to develop.

## How

- **`app.routes.ts`** — the comment block above the `/error` and `/offline` route definitions described the global `errorInterceptor` as redirecting on 5xx, but the implementation was narrowed down to `status === 0` only (5xx now stays component-level — see #434). Comment rewritten to match the actual contract: `/offline` is the auto-destination for status:0; `/error` is direct-nav only.
- **`cookie-policy.component.html`** — "Pulled live from `docs/legal/cookie-audit.md`" was misleading (the table is static HTML, not generated). Reworded to "Mirrored from… kept in lock-step manually; the markdown is the canonical source."
- **`cookie-policy.component.html` + `it/cookie-policy-it.component.html`** — replaced the "Manage your preferences" / "Gestisci le tue preferenze" `<a href="javascript:void(0)">` shape with a real `<button type="button">` styled as a link via the new `legal-page__inline-button` SCSS rule. The `javascript:` href is brittle under strict CSP and noisy for assistive tech; a real button has native keyboard semantics, so the explicit `(keydown.enter)`/`(keydown.space)` handlers also go away.
- **`cookie-banner.component.html`** — the banner was marked up `role="dialog"` + `aria-modal="false"`, but it doesn't behave like a dialog (no focus trap, no escape handling). Switched to `role="region"` with the existing `aria-label` so screen readers see a properly named landmark instead of a misleading dialog claim.

## Why

These five comments showed up on PR #438 because the release PR's diff exposes everything new since v1.16.0. Each fix is a small documentation / accessibility / UX polish that's better-shipped in v1.17 than rolled into a future tech-debt sweep.

## Test plan

- [x] Vitest: 588 passed (no impact — these are markup/comment changes plus an SCSS rule).
- [x] Cypress (locally, `cypress/included:15` against `ng serve`): full `cookie-banner.cy.ts` suite — 16 passing.
- [ ] CI `pr-checks` — pending.

## References

- Origin: PR #438 (release v1.17 develop→main) Copilot review.
- Touches code originally landed in #425 (error pages), #421 (cookie banner + policy).
