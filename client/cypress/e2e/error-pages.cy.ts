describe('Public error pages (#425)', () => {
  it('renders the server-error landing at /error', () => {
    cy.visit('/error');

    cy.contains('h1', 'Something went wrong').should('be.visible');
    cy.contains('p', 'unexpected error').should('be.visible');
    cy.get('[data-cy="server-error-retry"]').should('be.visible');
    cy.get('[data-cy="server-error-home"]').should('be.visible');
  });

  it('renders the offline landing at /offline', () => {
    cy.visit('/offline');

    cy.contains("h1", "You're offline").should('be.visible');
    cy.contains('p', "can't reach the network").should('be.visible');
    cy.get('[data-cy="offline-retry"]').should('be.visible');
  });

  it("server-error 'Back to home' navigates toward /dashboard/athletes", () => {
    cy.visit('/error');

    cy.get('[data-cy="server-error-home"]').click();

    // No auth → the dashboard guards bounce the visitor to /auth/login.
    // We assert the post-click URL is no longer /error rather than
    // pinning a specific destination, since the chain depends on guard
    // ordering and could legitimately change without affecting this
    // page's contract.
    cy.url().should('not.include', '/error');
  });
});
