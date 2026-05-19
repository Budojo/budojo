import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E coverage for the "Active sessions" panel on `/dashboard/profile`
 * (#413). Three flows — list-renders / single-revoke / revoke-all-others
 * — exercise the panel through PrimeNG's confirm-popup interaction.
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

const SESSIONS_INITIAL = [
  {
    id: 1,
    name: 'Chrome on macOS',
    last_used_at: '2026-05-10T08:00:00Z',
    created_at: '2026-05-01T08:00:00Z',
    is_current: false,
  },
  {
    id: 2,
    name: 'Safari on iOS',
    last_used_at: '2026-05-10T13:00:00Z',
    created_at: '2026-05-09T08:00:00Z',
    is_current: true,
  },
];

describe('Active sessions panel (#413)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders one row per session and stamps the current pill', () => {
    cy.intercept('GET', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: SESSIONS_INITIAL },
    }).as('sessions');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@sessions');

    // The panel is the LAST card on the profile page — make sure the
    // viewport reaches it before asserting visibility (the page
    // exceeds 720px and the panel sits below the fold). 1280×720
    // is the default Cypress viewport.
    cy.get('[data-cy="profile-sessions"]').scrollIntoView();
    cy.get('[data-cy="profile-sessions"]').should('be.visible');
    cy.get('[data-cy="profile-session-row-1"]').should('contain.text', 'Chrome on macOS');
    cy.get('[data-cy="profile-session-row-2"]').should('contain.text', 'Safari on iOS');

    // Exactly one current pill, on the current session row.
    cy.get('[data-cy="profile-session-current-pill"]').should('have.length', 1);
    cy.get('[data-cy="profile-session-row-2"] [data-cy="profile-session-current-pill"]').should(
      'be.visible',
    );

    // Revoke-others CTA is visible (there's at least one other session).
    cy.get('[data-cy="profile-sessions-revoke-others"]').should('be.visible');
  });

  it('revokes a single non-current session via the confirm popup', () => {
    cy.intercept('GET', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: SESSIONS_INITIAL },
    }).as('sessions');
    cy.intercept('DELETE', '/api/v1/me/sessions/1', { statusCode: 204 }).as('revoke');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@sessions');

    // Refetch on success returns the smaller list.
    cy.intercept('GET', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: [SESSIONS_INITIAL[1]] },
    }).as('refresh');

    cy.get('[data-cy="profile-session-revoke-1"]').scrollIntoView().click();
    // PrimeNG's confirm popup renders a `.p-confirmpopup-accept-button`
    // — click the accept arm.
    cy.get('.p-confirmpopup-accept-button').click();

    cy.wait('@revoke');
    cy.wait('@refresh');

    cy.get('[data-cy="profile-session-row-1"]').should('not.exist');
    cy.get('[data-cy="profile-session-row-2"]').should('be.visible');
  });

  it('revoke-all-others wipes every other session and refreshes the list', () => {
    cy.intercept('GET', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: SESSIONS_INITIAL },
    }).as('sessions');
    cy.intercept('DELETE', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: { revoked: 1 } },
    }).as('revokeOthers');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@sessions');

    cy.intercept('GET', '/api/v1/me/sessions', {
      statusCode: 200,
      body: { data: [SESSIONS_INITIAL[1]] },
    }).as('refresh');

    cy.get('[data-cy="profile-sessions-revoke-others"]').scrollIntoView().click();
    cy.get('.p-confirmpopup-accept-button').click();

    cy.wait('@revokeOthers');
    cy.wait('@refresh');

    // After revoke-others there's only the current session — the
    // CTA hides because there are no other sessions to revoke.
    cy.get('[data-cy="profile-sessions-revoke-others"]').should('not.exist');
    cy.get('[data-cy="profile-session-row-2"]').should('be.visible');
  });
});
