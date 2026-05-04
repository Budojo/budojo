export {};

/**
 * E2E for the M5 PR-A password-reset flow:
 *
 *   /auth/login → "Forgot your password?" → /auth/forgot-password
 *     → POST /api/v1/auth/forgot-password (202)
 *     → success panel
 *
 *   /auth/reset-password?token=…&email=…
 *     → POST /api/v1/auth/reset-password (200) → success → /auth/login
 *     → POST /api/v1/auth/reset-password (422) → invalid-link panel
 *
 * No backend; every API call is intercepted with `cy.intercept`.
 */

describe('Password reset (M5 PR-A)', () => {
  it('navigates from login to forgot-password and shows the success panel after submit', () => {
    cy.intercept('POST', '/api/v1/auth/forgot-password', {
      statusCode: 202,
      body: '',
    }).as('forgotPassword');

    cy.visit('/auth/login');
    cy.get('[data-cy="auth-forgot-password-link"]').click();
    cy.location('pathname').should('eq', '/auth/forgot-password');

    cy.get('[data-cy="forgot-password-email"]').type('mario@example.com');
    cy.get('[data-cy="forgot-password-submit"]').click();

    cy.wait('@forgotPassword').its('request.body').should('deep.equal', {
      email: 'mario@example.com',
    });
    cy.get('[data-cy="forgot-password-sent"]').should('be.visible');
  });

  it('shows the same success panel on a 429 throttle (no enumeration leak)', () => {
    cy.intercept('POST', '/api/v1/auth/forgot-password', {
      statusCode: 429,
      body: { message: 'Too Many Requests' },
    }).as('forgotPassword');

    cy.visit('/auth/forgot-password');
    cy.get('[data-cy="forgot-password-email"]').type('mario@example.com');
    cy.get('[data-cy="forgot-password-submit"]').click();

    cy.wait('@forgotPassword');
    cy.get('[data-cy="forgot-password-sent"]').should('be.visible');
  });

  it('renders the invalid-link panel when reset-password is opened with no token', () => {
    cy.visit('/auth/reset-password');
    cy.get('[data-cy="reset-password-invalid"]').should('be.visible');
    cy.get('[data-cy="reset-password-request-new"]')
      .should('have.attr', 'href')
      .and('include', '/auth/forgot-password');
  });

  it('completes a successful reset and redirects to login pre-filled with the email', () => {
    cy.intercept('POST', '/api/v1/auth/reset-password', {
      statusCode: 200,
      body: { message: 'passwords.reset' },
    }).as('resetPassword');

    cy.visit('/auth/reset-password?token=abc-token&email=mario%40example.com');

    // `<p-password>` renders the actual <input> inside the host, so we
    // target the input directly via the inputId.
    cy.get('#password').type('NewPassword1!');
    cy.get('#passwordConfirmation').type('NewPassword1!');
    cy.get('[data-cy="reset-password-submit"]').click();

    cy.wait('@resetPassword').its('request.body').should('deep.equal', {
      email: 'mario@example.com',
      token: 'abc-token',
      password: 'NewPassword1!',
      password_confirmation: 'NewPassword1!',
    });
    cy.get('[data-cy="reset-password-success"]').should('be.visible');

    // Auto-redirect lands on /auth/login with the email pre-filled in
    // the query string after the 1500ms timeout.
    cy.location('pathname', { timeout: 4000 }).should('eq', '/auth/login');
    // Angular's Router serializer keeps `@` raw in query strings (it's
    // not a reserved char in the query component per RFC 3986), so the
    // location.search ends up as `?email=mario@example.com` rather
    // than the URL-encoded `mario%40example.com`.
    cy.location('search').should('include', 'email=mario@example.com');
  });

  it('flips to the invalid-link panel when the server rejects the token (422)', () => {
    cy.intercept('POST', '/api/v1/auth/reset-password', {
      statusCode: 422,
      body: { message: 'The given data was invalid.', errors: { email: ['Invalid token.'] } },
    }).as('resetPassword');

    cy.visit('/auth/reset-password?token=expired&email=mario%40example.com');
    cy.get('#password').type('NewPassword1!');
    cy.get('#passwordConfirmation').type('NewPassword1!');
    cy.get('[data-cy="reset-password-submit"]').click();

    cy.wait('@resetPassword');
    cy.get('[data-cy="reset-password-invalid"]').should('be.visible');
  });
});
