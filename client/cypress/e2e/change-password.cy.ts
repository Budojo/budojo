import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E for the in-app change-password flow (#409). The user is logged in,
 * lands on /dashboard/profile, fills the three-field change-password
 * form, submits, and sees a success toast. The current Sanctum token
 * is preserved by the server so navigation continues to work.
 *
 * No backend; every API call is intercepted with `cy.intercept`.
 * `/api/v1/auth/me` is pre-seeded by the global `beforeEach` in
 * `cypress/support/e2e.ts`.
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

describe('Change password (#409)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
  });

  it('updates the password and shows a success toast (happy path)', () => {
    cy.intercept('POST', '/api/v1/me/password', {
      statusCode: 200,
      body: { message: 'Password updated.' },
    }).as('changePassword');

    cy.visitAuthenticated('/dashboard/profile');

    cy.get('[data-cy="profile-change-password"]').should('be.visible');

    // `<p-password>` renders the actual <input> inside the host, target
    // it via the inputId. Same trick as the password-reset E2E.
    cy.get('#currentPassword').type('OldPassword1!');
    cy.get('#newPassword').type('NewPassword1!');
    cy.get('#newPasswordConfirmation').type('NewPassword1!');

    cy.get('[data-cy="change-password-submit"]').click();

    cy.wait('@changePassword').its('request.body').should('deep.equal', {
      current_password: 'OldPassword1!',
      password: 'NewPassword1!',
      password_confirmation: 'NewPassword1!',
    });

    // Success toast confirms the operation since the form is reset and
    // would otherwise look like nothing happened.
    cy.contains('Password updated').should('be.visible');
  });
});
