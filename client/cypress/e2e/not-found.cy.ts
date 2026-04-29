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
    cy.contains('Pagina non trovata').should('be.visible');
  });

  it('also catches deep paths under unknown roots', () => {
    cy.visit('/foo/bar/baz', { failOnStatusCode: false });
    cy.contains('Pagina non trovata').should('be.visible');
  });

  it('CTA navigates to /dashboard/athletes — auth/has-academy guards then bounce as needed', () => {
    // Unauthenticated visitor — clicking "Torna alla home" lands on the
    // dashboard route, where authGuard redirects to /auth/login.
    cy.intercept('GET', '/api/v1/me*', { statusCode: 401 }).as('me');

    cy.visit('/asdfgh', { failOnStatusCode: false });
    cy.get('[data-cy="not-found-cta"]').click();

    cy.location('pathname').should('eq', '/auth/login');
  });
});
