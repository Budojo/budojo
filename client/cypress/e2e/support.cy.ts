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

    // Post-#446 the support endpoint accepts multipart/form-data so
    // an optional screenshot can ride alongside the text fields. The
    // request body in Cypress is the raw multipart envelope, not a
    // JSON object — assert against the textual form-part headers
    // instead. We don't pin the boundary token (it's randomised by
    // the browser) — the field names + values are what matter.
    cy.wait('@submitSupport')
      .its('request.body')
      .should((body: string) => {
        expect(body).to.be.a('string');
        expect(body).to.contain('name="subject"');
        expect(body).to.contain('Cannot reset my password');
        expect(body).to.contain('name="category"');
        expect(body).to.contain('account');
        expect(body).to.contain('name="body"');
        expect(body).to.contain(
          'I clicked the reset link in my inbox and it returns a 404. Tested on Chrome 132.',
        );
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

  // Support discoverability moved off the desktop sidebar into the owner More
  // hub with the rail refactor (#1112) — covered by owner-more.component.spec.ts
  // (owner-more-support). The legacy nav-feedback entry stays retired (#446).
});

/**
 * The build that cannot send (#1476).
 *
 * The page above assumes a runtime with the `email` capability, which is the
 * web profile. On the desktop build there is no mail transport, and until
 * #1476 the form was still there: it posted, the server wrote a ticket row
 * into the local SQLite, queued a mail nothing could deliver, and answered
 * 202. #1464 hid the row that led here; this covers the two halves that were
 * left — the route itself, and what replaced the row.
 */
describe('Support on a build with no mail transport (#1476)', () => {
  function seed(capabilities: string[]) {
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/runtime', {
      statusCode: 200,
      body: {
        data: { profile: capabilities.includes('email') ? 'web' : 'desktop', capabilities },
      },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          first_name: 'Matteo',
          last_name: 'Bonanno',
          full_name: 'Matteo Bonanno',
          handle: 'matteo',
          email: 'm@example.com',
          email_verified_at: '2025-01-01T00:00:00Z',
          avatar_url: null,
          two_factor_enabled: false,
          role: 'owner',
        },
      },
    });
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
      },
    });
  }

  it('sends a deep link away instead of rendering a form that cannot post', () => {
    // A bookmark, a back button or a stale link. Without the guard the page
    // renders, the user writes their message, and the POST answers 404.
    seed(['community']);
    cy.visitAuthenticated('/dashboard/support');

    cy.location('pathname', { timeout: 8000 }).should('not.include', '/support');
  });

  it('leaves the form alone where it works', () => {
    seed(['community', 'email']);
    cy.visitAuthenticated('/dashboard/support');

    cy.get('[data-cy="support-form"]').should('be.visible');
  });

  it('offers a mailto from the More hub, with the address readable', () => {
    // The address as text and not only as a target: a `mailto:` does nothing
    // at all on a machine with no mail client configured.
    seed(['community']);
    cy.viewport(1280, 800);
    cy.visitAuthenticated('/dashboard/more');

    cy.get('[data-cy="owner-more-support"]').should('not.exist');
    cy.get('[data-cy="owner-more-support-mailto"]')
      .should('contain.text', 'matteobonanno1990@gmail.com')
      .and('have.attr', 'href')
      .and('include', 'mailto:matteobonanno1990@gmail.com')
      // CRLF line breaks — RFC 6068 §5, and what Outlook needs to keep the
      // three diagnostic lines apart.
      .and('include', '%0D%0A');
  });
});
