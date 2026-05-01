// E2E coverage for the wildcard 404 page (#226).
// Verifies that any unmatched URL renders the NotFoundComponent
// instead of the previous blank-page fallback Luigi reported on prod.

describe('404 — wildcard route', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('renders the NotFoundComponent on any unmatched URL', () => {
    cy.visit('/does-not-exist', { failOnStatusCode: false });

    cy.get('[data-cy="not-found-cta"]').should('be.visible');
    // Default i18n locale is English (#278). Italian copy is exercised
    // by the i18n-keys parity spec, not here.
    cy.contains('Page not found').should('be.visible');
  });

  it('also catches deep paths under unknown roots', () => {
    cy.visit('/foo/bar/baz', { failOnStatusCode: false });
    cy.contains('Page not found').should('be.visible');
  });

  it('CTA navigates to /dashboard/athletes — authGuard then redirects an unauthenticated visitor to /auth/login', () => {
    // No interceptors needed: with localStorage cleared in beforeEach,
    // authGuard redirects synchronously based on the missing auth token,
    // before any guard ever fires an HTTP request. (loadCurrentUser hits
    // /api/v1/auth/me; hasAcademyGuard hits /api/v1/academy — both are
    // skipped on the unauthenticated path.)
    cy.visit('/asdfgh', { failOnStatusCode: false });
    cy.get('[data-cy="not-found-cta"]').click();

    cy.location('pathname').should('eq', '/auth/login');
  });
});
