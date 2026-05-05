import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Support page (#423) — submit a subject + category + body → server
 * persists a `support_tickets` row + queues an email with Reply-To
 * set to the user. Distinct from the feedback page (#311). The page
 * sits inside the dashboard shell so auth + has-academy guards fire;
 * we use cy.visitAuthenticated to pre-seed the auth_token. POST
 * /api/v1/support is intercepted (no real email sent in CI).
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

describe('Support page (#423)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
    cy.visitAuthenticated('/dashboard/support');
  });

  it('renders the form with title, subject, category, body and submit', () => {
    cy.get('[data-cy="support-form"]').should('be.visible');
    cy.get('[data-cy="support-subject"]').should('be.visible');
    cy.get('[data-cy="support-category"]').should('be.visible');
    cy.get('[data-cy="support-body"]').should('be.visible');
    cy.get('[data-cy="support-submit"] button').should('be.disabled');
  });

  it('submits the form and shows the success toast + resets the inputs', () => {
    cy.intercept('POST', '/api/v1/support', {
      statusCode: 202,
      body: { data: { id: 99, created_at: '2026-05-05T10:00:00Z' } },
    }).as('submitSupport');

    cy.get('[data-cy="support-subject"]').type('Cannot reset my password');

    // PrimeNG p-select: click to open, then click the option label.
    cy.get('[data-cy="support-category"]').click();
    cy.get('.p-select-overlay').contains('Account').click();

    cy.get('[data-cy="support-body"]').type(
      'I clicked the reset link in my inbox and it returns a 404. Tested on Chrome 132.',
    );

    cy.get('[data-cy="support-submit"] button').should('not.be.disabled').click();

    cy.wait('@submitSupport')
      .its('request.body')
      .should((body) => {
        expect(body).to.deep.equal({
          subject: 'Cannot reset my password',
          category: 'account',
          body: 'I clicked the reset link in my inbox and it returns a 404. Tested on Chrome 132.',
        });
      });

    cy.get('.p-toast-message-success').should('be.visible');

    // Form contents cleared — the user can file a follow-up without leaving.
    cy.get('[data-cy="support-subject"]').should('have.value', '');
    cy.get('[data-cy="support-body"]').should('have.value', '');
  });

  it('shows the error toast and keeps form contents on a server failure', () => {
    cy.intercept('POST', '/api/v1/support', {
      statusCode: 500,
      body: { message: 'Server error.' },
    }).as('submitSupportFail');

    cy.get('[data-cy="support-subject"]').type('Subject I do not want to retype');
    cy.get('[data-cy="support-category"]').click();
    cy.get('.p-select-overlay').contains('Bug').click();
    cy.get('[data-cy="support-body"]').type(
      'Body I do not want to retype either — keep me here on error please.',
    );

    cy.get('[data-cy="support-submit"] button').click();
    cy.wait('@submitSupportFail');

    cy.get('.p-toast-message-error').should('be.visible');

    cy.get('[data-cy="support-subject"]').should('have.value', 'Subject I do not want to retype');
    cy.get('[data-cy="support-body"]').should('contain.value', 'Body I do not want to retype');
  });

  it('the sidebar nav-support link is rendered above Send feedback', () => {
    cy.get('[data-cy="nav-support"]').should('be.visible').and('contain.text', 'Contact support');

    cy.get('[data-cy="nav-support"]').then(($support) => {
      cy.get('[data-cy="nav-feedback"]').then(($feedback) => {
        const cmp = $support[0].compareDocumentPosition($feedback[0]);
        // DOCUMENT_POSITION_FOLLOWING = 4 — feedback follows support.
        expect(cmp & 4, 'feedback follows support').to.equal(4);
      });
    });
  });
});
