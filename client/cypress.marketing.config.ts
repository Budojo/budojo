import { defineConfig } from 'cypress';

/**
 * Cypress config for the Play Store screenshot capture spec (#690).
 *
 * Separate from `cypress.config.ts` because the marketing run needs a
 * `before:browser:launch` hook to size the Chrome window large enough
 * for the tablet-10 viewport (1600×2560) — the default config sized
 * to the per-spec defaults (1280×720) would silently clamp any
 * `cy.viewport(1600, 2560)` to the window size at launch, and the
 * resulting PNGs would come out at 1280×633 instead of 1600×2560.
 *
 * Why a launch hook and not just `viewportWidth/Height` config: the
 * config values are read by Cypress AT TEST RUNTIME to set the iframe,
 * but Chrome's browser window itself is launched once at process
 * start and never resized. To enlarge the window we pass
 * `--window-size=W,H` via the Chrome args at launch. Adding a few
 * hundred pixels of headroom over the largest viewport gives Cypress
 * room to render its runner chrome (test list, command log) without
 * cropping the iframe.
 *
 * Only used by `scripts/play-store-screenshots.cjs` (passed via
 * `--config-file`). The regular E2E suite continues to read
 * `cypress.config.ts`.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    specPattern: 'cypress/marketing/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    // Match the largest viewport the spec requests so the iframe sizing
    // never needs to grow past the launch-time chrome window.
    viewportWidth: 1600,
    viewportHeight: 2560,
    video: false,
    setupNodeEvents(on) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          // Width matches the largest viewport, height adds ~150 px of
          // headroom for cypress's runner chrome so the iframe content
          // isn't pushed out of view on capture.
          launchOptions.args.push('--window-size=1600,2700');
          // Force device pixel ratio = 1 so the PNG resolution matches
          // the requested CSS pixel size exactly (without this, HiDPI
          // displays multiply by 2 and we'd ship 3200×5400 PNGs that
          // Play Console rejects as too large).
          launchOptions.args.push('--force-device-scale-factor=1');
        }
        return launchOptions;
      });
    },
  },
});
