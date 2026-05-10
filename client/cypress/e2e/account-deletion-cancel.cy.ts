/**
 * E2E coverage for the email-link account-deletion cancel flow (#545).
 *
 * Three scenarios — `cancelled: true`, `cancelled: false`, and HTTP
 * error — exercise the public landing page reached by the "Cancel
 * deletion" CTA in `AccountDeletionRequestedMail`. The page lives
 * outside the dashboard shell (no auth guard), so the user clicking
 * from a logged-out tab in their inbox lands here directly without
 * being bounced to /auth/login.
 */

describe('Account-deletion cancel by token (#545)', () => {
  it('cancelled: true → success panel with a continue CTA', () => {
    const token = 'a'.repeat(64);
    cy.intercept('POST', `/api/v1/me/deletion-request/cancel/${token}`, {
      statusCode: 200,
      body: { data: { cancelled: true } },
    }).as('cancel');

    cy.visit(`/account/deletion-cancel/${token}`);
    cy.wait('@cancel');

    cy.get('[data-cy="account-deletion-cancel-success"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-cy="account-deletion-cancel-cta-success"]').should('exist');
    // No auto-redirect — the user just clicked an email link, they
    // deserve a calm landing page that stays put until they tap.
    // The token segment IS stripped from the URL post-consume (#557
    // copilot review — defense-in-depth against screenshot / Referer
    // / browser-history leakage), so we assert the path lands on
    // `/account/deletion-cancel` WITHOUT the token tail.
    cy.url().should('include', '/account/deletion-cancel').and('not.include', token);
  });

  it('cancelled: false → "no longer pending" panel (idempotent re-click)', () => {
    const token = 'b'.repeat(64);
    cy.intercept('POST', `/api/v1/me/deletion-request/cancel/${token}`, {
      statusCode: 200,
      body: { data: { cancelled: false } },
    }).as('cancel');

    cy.visit(`/account/deletion-cancel/${token}`);
    cy.wait('@cancel');

    cy.get('[data-cy="account-deletion-cancel-no-longer-pending"]', {
      timeout: 5000,
    }).should('be.visible');
    cy.get('[data-cy="account-deletion-cancel-cta-no-longer-pending"]').should('exist');
  });

  it('5xx response → error panel with a continue CTA', () => {
    const token = 'c'.repeat(64);
    cy.intercept('POST', `/api/v1/me/deletion-request/cancel/${token}`, {
      statusCode: 500,
      body: { message: 'server_error' },
    }).as('cancel');

    cy.visit(`/account/deletion-cancel/${token}`);
    cy.wait('@cancel');

    cy.get('[data-cy="account-deletion-cancel-error"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-cy="account-deletion-cancel-cta-error"]').should('exist');
  });
});
