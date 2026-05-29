# Visual verification before push

The **behavioural rule** (the _what_) lives in [`client/CLAUDE.md`](../../client/CLAUDE.md) § What Claude Should Always Do. This file is the _how_.

## The rule

Gates (`prettier` + `lint` + `vitest`) verify **code**, not the **rendered result**. **Every** change that alters what the user sees gets a real-browser smoke before push — no "it's trivial" exception:

- templates (`*.component.html`), component SCSS, global styles
- icons / glyphs, copy, colour, spacing, layout
- adopting a shared shell (`app-card`, `app-confirm-destructive-button`, `app-icon-button`, …) — the chrome visibly changes
- responsive / mobile `@media`, focus / hover, motion

Verify at **desktop + mobile** when layout is mobile-relevant. The only non-verify path is when the environment genuinely can't render the change — then say so explicitly in the PR ("haven't smoked visually because X; check Y"), never imply "all green = visually correct".

Why: gates have shipped visually-broken UI before — v2.1.0 #491 (password eye icons) was all-green and Copilot-approved with the wrong SVG shape, needing a v2.1.1 hotfix. A 30-second smoke catches it.

## Recipe — screenshot against the live dev server

The `budojo_client` container is **Alpine**; Cypress's bundled Electron (glibc) can't launch inside it, and the host has no client `node_modules`. Use the **`cypress/included` image** (match the version the container reports via `docker exec budojo_client npx cypress version`) with `--network host` so it reaches `ng serve` on `localhost:4200`:

```bash
docker run --rm --network host \
  -v "$(pwd)/client":/e2e -w /e2e \
  cypress/included:15.15.0 \
  --spec 'cypress/e2e/_tmp-shot.cy.ts' --config video=false --browser electron
```

Throwaway spec — delete before commit (`cypress/screenshots/` is gitignored):

```ts
import { MOCK_ACADEMY } from '../support/fixtures';

describe('TMP visual', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Catch-all FIRST so an unmocked background poll can't redirect to /login
    // (the dev server answers unknown /api routes with index.html → the auth
    // interceptor bounces). Specific overrides registered AFTER it win.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/auth/me*', { statusCode: 200, body: { data: { /* user */ } } });
    cy.intercept('GET', '/api/v1/me', { statusCode: 200, body: { data: { /* user */ } } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    // + the page's own data endpoints
  });

  it('shot', () => {
    cy.viewport(1440, 900);
    cy.visitAuthenticated('/dashboard/<route>');
    // Navigate to the right tab/section if the panel isn't on the default view
    // (e.g. profile-sessions lives under Settings → Security, not Profile).
    cy.get('[data-cy="<anchor>"]').screenshot('desktop'); // element shot
    cy.viewport(375, 667);
    cy.screenshot('mobile', { capture: 'viewport' }); // viewport shot
  });
});
```

Screenshots land in `client/cypress/screenshots/<spec>/`.

## Two traps

1. **Stale dev server.** `ng serve` can serve an intermediate broken build (mid-edit) or miss the last save. Before running Cypress, `touch` the changed files and confirm `docker logs budojo_client` shows `Application bundle generation complete` with no `NG…` / `TS…` errors. A login-page screenshot when you expected the feature usually means a stale build or the redirect — not necessarily your code.
2. **Prove no-regression by baseline.** If an existing Cypress spec fails locally, `git stash` your change and rerun: an identical failure is environmental (the redirect above), not your diff.

The `/verify` and `/run` skills wrap "launch + observe"; the recipe here is the manual fallback when a screenshot artifact is the deliverable.
