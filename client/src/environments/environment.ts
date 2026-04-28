/**
 * Default Angular environment — used by `ng serve`, Vitest, Cypress, and any
 * non-production build configuration.
 *
 * `apiBase` is empty so HTTP services emit relative URLs (`/api/v1/...`).
 * The dev server's `proxy.conf.json` rewrites `/api/*` to the Laravel
 * container; tests intercept relative URLs the same way; Cypress mocks
 * everything via `cy.intercept()`.
 *
 * The production build replaces this file with `environment.prod.ts` via
 * `fileReplacements` in `angular.json`. See that file for prod values.
 */
export const environment = {
  production: false,
  apiBase: '',
};
