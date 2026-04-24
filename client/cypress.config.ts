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
