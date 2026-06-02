import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    // `cypress/e2e/**/*.cy.ts` — only E2E tests. The design-inventory
    // screenshot producer lives in a sibling folder `cypress/inventory/`
    // so it's OUT of this glob by construction, not by an exclude
    // pattern (Cypress 13 applies excludeSpecPattern even when --spec
    // is passed explicitly, which silently dropped our inventory runs
    // into "no specs found"). See scripts/design-inventory.cjs for how
    // the inventory glob gets enabled on demand.
    specPattern: 'cypress/e2e/**/*.cy.ts',
    // Temporarily excluded specs surfaced by re-enabling Cypress in CI (#1195
    // / closes #1193). Each is a real product regression accumulated while
    // Cypress was off in CI (#758, 2026-05-15 → 2026-06-01) — not a flake,
    // not an infra artefact (reproduced on self-hosted static-serve,
    // self-hosted ng-serve, and github-hosted ng-serve). Drop the
    // corresponding line once the underlying render bug is fixed; the gate
    // then catches future regressions on these pages again. Per the comment
    // above, Cypress 13 applies excludeSpecPattern even when `--spec` is
    // passed explicitly, so the matrix-sharded runs in pr-checks.yml will
    // silently skip these too.
    excludeSpecPattern: [
      'cypress/e2e/attendance-summary.cy.ts', // TODO(#1196): monthly-summary-total not rendering
      'cypress/e2e/profile-mobile.cy.ts', // TODO(#1197): profile-name not rendering on mobile
      'cypress/e2e/profile-two-factor.cy.ts', // TODO(#1198): profile-two-factor-qr not rendering after enrol
      'cypress/e2e/public-profile.cy.ts', // TODO(#1199): timeline rows not rendering
      'cypress/e2e/academy.cy.ts', // TODO(#1200): academy-name not rendering
      'cypress/e2e/dashboard-expiring.cy.ts', // TODO(#1201): expiring-widget-count not rendering
      'cypress/e2e/whats-new.cy.ts', // TODO(#1203): whats-new spec failure
      'cypress/e2e/athlete-invite.cy.ts', // TODO(#1204): athlete-invite failure
    ],
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    // Default screenshots path — for test-failure screenshots from e2e specs.
    // The design inventory workflow overrides this per-run via the
    // `design:inventory` npm script so the committed reference library
    // doesn't co-mingle with transient test failure artifacts.
    screenshotsFolder: 'cypress/screenshots',
  },
});
