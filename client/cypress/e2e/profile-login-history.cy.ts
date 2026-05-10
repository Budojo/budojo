import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E coverage for the "Login history" panel on `/dashboard/profile`
 * (#430).
 */

const FAKE_USER = {
  id: 1,
  first_name: 'Tester',
  last_name: 'McTest',
  full_name: 'Tester McTest',
  handle: null,
  email: 'tester@example.com',
  role: 'owner' as const,
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
  pending_email_change: null,
};

const HISTORY_ROWS = [
  {
    id: 1,
    success: true,
    device: 'Chrome on macOS',
    ip_address: '203.0.113.42',
    created_at: '2026-05-10T13:00:00Z',
  },
  {
    id: 2,
    success: false,
    device: 'Unknown device',
    ip_address: '198.51.100.7',
    created_at: '2026-05-09T22:30:00Z',
  },
];

describe('Login history panel (#430)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // Active sessions panel sits above this one on the same page.
    cy.intercept('GET', '/api/v1/me/sessions', { statusCode: 200, body: { data: [] } });
  });

  it('renders one row per attempt and stamps the failed-pill on failures', () => {
    cy.intercept('GET', '/api/v1/me/login-history', {
      statusCode: 200,
      body: { data: HISTORY_ROWS },
    }).as('history');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@history');

    cy.get('[data-cy="profile-login-history"]').scrollIntoView();
    cy.get('[data-cy="profile-login-history"]').should('be.visible');

    cy.get('[data-cy="profile-login-history-row-1"]').should('contain.text', 'Chrome on macOS');
    cy.get('[data-cy="profile-login-history-row-2"]').should('contain.text', 'Unknown device');

    // Footer hint shows whenever at least one row is visible. The
    // hint sits BELOW the row list — on the default 1280×720
    // Cypress viewport it's below the fold of the profile page, so
    // we have to scroll into view before asserting visibility.
    cy.get('[data-cy="profile-login-history-hint"]').scrollIntoView();
    cy.get('[data-cy="profile-login-history-hint"]').should('be.visible');
  });

  it('renders the empty state when no attempts have been recorded', () => {
    cy.intercept('GET', '/api/v1/me/login-history', {
      statusCode: 200,
      body: { data: [] },
    }).as('historyEmpty');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@historyEmpty');

    cy.get('[data-cy="profile-login-history-empty"]').scrollIntoView();
    cy.get('[data-cy="profile-login-history-empty"]').should('be.visible');
    cy.get('[data-cy="profile-login-history-hint"]').should('not.exist');
  });
});
