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
    // Empty: every spec surfaced by re-enabling Cypress in CI (#1195 /
    // closes #1193, regressions #1196–#1204 accumulated while Cypress was
    // off #758 2026-05-15 → 2026-06-01) is now fixed and back in the gate.
    // Re-add a `'cypress/e2e/<spec>.cy.ts', // TODO(#NNNN)` line only to
    // park a confirmed regression while its fix is in flight — Cypress 13
    // applies excludeSpecPattern even when `--spec` is passed explicitly,
    // so the matrix-sharded runs in pr-checks.yml will skip it too.
    excludeSpecPattern: [],
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    // Default screenshots path — for test-failure screenshots from e2e specs.
    // The design inventory workflow overrides this per-run via the
    // `design:inventory` npm script so the committed reference library
    // doesn't co-mingle with transient test failure artifacts.
    screenshotsFolder: 'cypress/screenshots',
    setupNodeEvents(on) {
      // The headless Electron window opens at 1280×720 and a `cy.viewport()`
      // taller than that is scaled to fit, not given the room — so every
      // screenshot of an 860-tall viewport came back 720 tall. Open the
      // window large enough for the desktop audit's frames (#1614); the
      // e2e specs keep their 1280×720 viewport and are unaffected.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'electron') {
          launchOptions.preferences['width'] = 1600;
          launchOptions.preferences['height'] = 1000;
        }
        return launchOptions;
      });
    },
  },
});
