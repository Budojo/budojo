import './commands';

// Default `GET /api/v1/auth/me` mock — the dashboard shell calls
// `loadCurrentUser()` on init, and a network failure on that side-effect
// trips the global `errorInterceptor` (#425) which renders
// `<app-offline>` in place of the page under test (the dev server's
// `/api` proxy fails in CI because no backend is wired). Registered in
// a global `beforeEach` so it runs BEFORE any test-file `beforeEach` —
// any spec that needs a custom `/me` (Mario Rossi for profile-mobile,
// an unverified user for the verification banner spec, etc.) registers
// its own intercept later and Cypress matches the most-recent
// registration. This default only catches the otherwise-unmocked case.
// Default `GET /api/v1/academy/fee-tiers` mock (#1381) — the academy form and
// the athlete form both load the price list on init. An empty list is the
// state of every academy that charges one flat fee, so it is also the right
// default here: the tier field simply doesn't render. Same override rule as
// `/me` above — a spec that needs actual tiers registers its own later.
beforeEach(() => {
  cy.intercept('GET', '/api/v1/academy/fee-tiers*', {
    statusCode: 200,
    body: { data: [] },
  });
});

beforeEach(() => {
  cy.intercept('GET', '/api/v1/auth/me*', {
    statusCode: 200,
    body: {
      data: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        email_verified_at: '2026-01-01T00:00:00Z',
        avatar_url: null,
      },
    },
  });
});
