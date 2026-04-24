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
    // Design inventory screenshots live under `docs/design/screenshots/`
    // at the repo root — committed as a visual reference library. Regular
    // test-failure screenshots land there too, but the inventory spec is
    // the primary producer. Cypress resolves relative paths from the
    // config file location (`client/`), so `../docs/...` points at
    // `<repo-root>/docs/...`.
    screenshotsFolder: '../docs/design/screenshots',
    trashAssetsBeforeRuns: false, // don't wipe between runs — we commit these
  },
});
