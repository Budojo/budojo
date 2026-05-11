/**
 * E2E coverage for the public unsubscribe landing (#417).
 *
 * The signed-URL backend at `/api/v1/unsubscribe/{userId}/{category}`
 * does the actual preference flip and 302-redirects here with either
 * `?category=<known-key>` (success) or `?status=invalid` (tampered /
 * unknown). Two scenarios cover the two states.
 */

describe('Unsubscribe landing (#417)', () => {
  it('renders the success panel when category is in the catalog', () => {
    cy.visit('/unsubscribed?category=medical_cert_expiry_reminders');

    cy.get('[data-cy="unsubscribe-page"]').should('be.visible');
    cy.get('[data-cy="unsubscribe-success"]').should('be.visible');
    cy.get('[data-cy="unsubscribe-cta-success"]').should('exist');
    cy.url().should('include', '/unsubscribed');
  });

  it('renders the invalid panel on status=invalid', () => {
    cy.visit('/unsubscribed?status=invalid');

    cy.get('[data-cy="unsubscribe-invalid"]').should('be.visible');
    cy.get('[data-cy="unsubscribe-success"]').should('not.exist');
    cy.get('[data-cy="unsubscribe-cta-invalid"]').should('exist');
  });
});
