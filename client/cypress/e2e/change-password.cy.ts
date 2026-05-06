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
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: null,
      last_page: 1,
      path: '',
      per_page: 20,
      to: null,
      total: 0,
    },
  },
};
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };

describe('Change password (#409)', () => {
  beforeEach(() => {
    // Dashboard shell side-effects — mocked so the page renders cleanly
    // without a backend (mirrors the profile-mobile spec).
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
  });

  it('updates the password and shows a success toast (happy path)', () => {
    cy.intercept('POST', '/api/v1/me/password', {
      statusCode: 200,
      body: { message: 'Password updated.' },
    }).as('changePassword');

    cy.visitAuthenticated('/dashboard/profile');

    cy.get('[data-cy="profile-change-password"]').should('be.visible');

    // `<p-password>` renders the actual <input> inside the host. Match
    // the existing auth-page selector pattern (`input[id="..."]`) so we
    // can't accidentally pick a non-input element that happens to share
    // the inputId; the previous `#id`-only selector was too loose under
    // the toggle-mask DOM.
    cy.get('input[id="currentPassword"]').type('OldPassword1!');
    cy.get('input[id="newPassword"]').type('NewPassword1!');
    cy.get('input[id="newPasswordConfirmation"]').type('NewPassword1!');

    // PrimeNG's `<p-button>` is a custom element host; the actual
    // `<button type="submit">` lives inside it, and only clicking the
    // inner element triggers the parent form's `(ngSubmit)` handler.
    // Clicking the host (matched by the `data-cy`) leaves the form
    // untouched and the API call never fires (caught locally via
    // cypress/included:15 — the screenshot showed all three fields
    // filled but no request).
    cy.get('[data-cy="change-password-submit"] button').should('not.be.disabled').click();

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
