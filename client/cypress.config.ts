import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    // The design inventory is not a test — it's a screenshot producer
    // used on demand via `npm run design:inventory`. Keeping it out of
    // the default glob so it doesn't add ~1min to every PR and so CI
    // doesn't wastefully regenerate screenshots nobody will commit.
    excludeSpecPattern: 'cypress/e2e/design-inventory.cy.ts',
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
