import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E coverage for the email-notification preferences panel on
 * `/dashboard/profile` (#416).
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

describe('Email notification preferences (#416)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/sessions', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/login-history', { statusCode: 200, body: { data: [] } });
  });

  it('renders the panel with both toggleable categories enabled by default', () => {
    cy.intercept('GET', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: {
        data: {
          medical_cert_expiry_reminders: true,
          unpaid_athletes_digest: true,
        },
      },
    }).as('prefs');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@prefs');

    cy.get('[data-cy="profile-notifications"]').scrollIntoView();
    cy.get('[data-cy="profile-notifications"]').should('be.visible');

    cy.get('[data-cy="profile-notifications-row-medical_cert_expiry_reminders"]').should(
      'be.visible',
    );
    cy.get('[data-cy="profile-notifications-row-unpaid_athletes_digest"]').should('be.visible');
    cy.get('[data-cy="profile-notifications-transactional"]').should('be.visible');
  });

  it('toggles a category off → PATCH fires → switch reflects the new value', () => {
    cy.intercept('GET', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: {
        data: {
          medical_cert_expiry_reminders: true,
          unpaid_athletes_digest: true,
        },
      },
    }).as('prefs');

    cy.intercept('PATCH', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: {
        data: {
          medical_cert_expiry_reminders: false,
          unpaid_athletes_digest: true,
        },
      },
    }).as('patch');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@prefs');

    cy.get('[data-cy="profile-notifications-toggle-medical_cert_expiry_reminders"]')
      .scrollIntoView()
      .click();

    cy.wait('@patch')
      .its('request.body.preferences.medical_cert_expiry_reminders')
      .should('eq', false);
  });
});
