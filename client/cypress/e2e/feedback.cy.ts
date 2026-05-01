import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Feedback page (#311) — submit a subject + description (and optionally
 * an image) → server emails the product owner. The page sits inside
 * the dashboard shell so auth + has-academy guards fire; we use
 * cy.visitAuthenticated to pre-seed the auth_token. POST /api/v1/feedback
 * is intercepted (no real email sent in CI).
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };
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
const ME_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      deletion_pending: null,
    },
  },
};

describe('Feedback page (#311)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
    cy.intercept('GET', '/api/v1/auth/me', ME_OK);
    cy.visitAuthenticated('/dashboard/feedback');
  });

  it('renders the form with title, subject, description and submit', () => {
    cy.get('[data-cy="feedback-form"]').should('be.visible');
    cy.get('[data-cy="feedback-subject"]').should('be.visible');
    cy.get('[data-cy="feedback-description"]').should('be.visible');
    cy.get('[data-cy="feedback-submit"] button').should('be.disabled');
  });

  it('submits the form and shows the success toast + resets the inputs', () => {
    cy.intercept('POST', '/api/v1/feedback', {
      statusCode: 202,
      body: { message: 'Feedback received.' },
    }).as('submitFeedback');

    cy.get('[data-cy="feedback-subject"]').type('Athletes list paid filter sticky');
    cy.get('[data-cy="feedback-description"]').type(
      'Clearing the paid filter still keeps the URL param. Tested on Chrome 132.',
    );

    cy.get('[data-cy="feedback-submit"] button').should('not.be.disabled').click();

    cy.wait('@submitFeedback')
      .its('request.body')
      .should((body) => {
        // FormData is opaque in Cypress — assert on the underlying
        // raw body string the request carried; multipart bodies
        // contain `name="<field>"` boundaries.
        expect(String(body)).to.include('name="subject"');
        expect(String(body)).to.include('name="description"');
        expect(String(body)).to.include('name="app_version"');
      });

    cy.get('.p-toast-message-success').should('be.visible').and('contain.text', 'sent');

    // Form contents cleared — the user can file a follow-up without leaving.
    cy.get('[data-cy="feedback-subject"]').should('have.value', '');
    cy.get('[data-cy="feedback-description"]').should('have.value', '');
  });

  it('shows the error toast and keeps form contents on a server failure', () => {
    cy.intercept('POST', '/api/v1/feedback', {
      statusCode: 500,
      body: { message: 'Server error.' },
    }).as('submitFeedbackFail');

    cy.get('[data-cy="feedback-subject"]').type('Subject I do not want to retype');
    cy.get('[data-cy="feedback-description"]').type(
      'Description I do not want to retype either — keep me here on error please.',
    );

    cy.get('[data-cy="feedback-submit"] button').click();
    cy.wait('@submitFeedbackFail');

    cy.get('.p-toast-message-error').should('be.visible');

    cy.get('[data-cy="feedback-subject"]').should('have.value', 'Subject I do not want to retype');
    cy.get('[data-cy="feedback-description"]').should(
      'contain.value',
      'Description I do not want to retype',
    );
  });

  it("the sidebar nav-feedback link is rendered above What's new", () => {
    cy.get('[data-cy="nav-feedback"]').should('be.visible').and('contain.text', 'Send feedback');

    cy.get('[data-cy="nav-feedback"]').then(($feedback) => {
      cy.get('[data-cy="nav-whats-new"]').then(($whatsNew) => {
        const cmp = $feedback[0].compareDocumentPosition($whatsNew[0]);
        // DOCUMENT_POSITION_FOLLOWING = 4 — what's-new follows feedback.
        expect(cmp & 4, "what's-new follows feedback").to.equal(4);
      });
    });
  });
});
