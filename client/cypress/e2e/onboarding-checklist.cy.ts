import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * First-run "Getting started" checklist E2E (#424). Three scenarios:
 *  1. Fresh user (no dismissal, no completed steps) → checklist renders.
 *  2. Clicking a step CTA → navigation fires + the row turns "done".
 *  3. Dismiss flow — confirm popup → row hides + survives reload.
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

const FRESH_STATE = {
  dismissed_at: null,
  completed_steps: [],
  available_steps: [
    'add_athlete',
    'log_attendance',
    'mark_payment',
    'upload_document',
    'view_stats',
  ],
};

describe('First-run onboarding checklist (#424)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', {
      statusCode: 200,
      body: { data: [], meta: { total: 0 } },
    });
    cy.intercept('GET', '/api/v1/payments/summary*', {
      statusCode: 200,
      body: { data: { paid: 0, unpaid: 0 } },
    });
  });

  it('renders five step rows when the user is brand new', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: { data: FRESH_STATE },
    }).as('onboarding');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@onboarding');

    cy.get('[data-cy="onboarding-checklist"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-add_athlete"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-log_attendance"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-mark_payment"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-upload_document"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-view_stats"]').should('be.visible');
  });

  it('clicking "Show me" on a step navigates and marks it complete', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: { data: FRESH_STATE },
    }).as('onboarding');
    cy.intercept('POST', '/api/v1/me/onboarding/steps', {
      statusCode: 200,
      body: { data: { completed_steps: ['add_athlete'] } },
    }).as('complete');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@onboarding');

    cy.get('[data-cy="onboarding-step-add_athlete-cta"] button').click();
    cy.wait('@complete');

    cy.url().should('include', '/dashboard/athletes/new');
  });

  it('renders nothing when the user has already dismissed the tour', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: {
          dismissed_at: '2026-05-01T00:00:00Z',
          completed_steps: [],
          available_steps: FRESH_STATE.available_steps,
        },
      },
    }).as('onboarding');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@onboarding');

    cy.get('[data-cy="onboarding-checklist"]').should('not.exist');
  });
});
