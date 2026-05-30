// Desktop athletes-list row delete flow (#1033 — design-system adoption).
// The desktop trash action now renders via <app-confirm-destructive-button>
// (the edit action via <app-icon-button>). This locks the safety-critical
// behaviour: delete opens a confirm popup, fires DELETE only on accept.

const OWNER = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      first_name: 'Owner',
      last_name: 'User',
      full_name: 'Owner User',
      handle: 'owner1',
      email: 'o@e.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
      role: 'owner',
    },
  },
};
const ACADEMY = {
  statusCode: 200,
  body: { data: { id: 1, name: 'BJJ Rome', city: 'Rome', country_code: 'IT' } },
};
const ATHLETES = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 7,
        first_name: 'Marco',
        last_name: 'Rossi',
        date_of_birth: '1995-03-10',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        paid_current_month: true,
        user_handle: 'marcobjj',
        user_avatar_url: null,
        facebook: null,
        instagram: null,
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
  },
};

describe('Athletes desktop row delete (#1033)', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/auth/me*', OWNER);
    cy.intercept('GET', '/api/v1/academy*', ACADEMY);
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES).as('athletes');
    cy.intercept('DELETE', '/api/v1/athletes/7', { statusCode: 204 }).as('del');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');
  });

  it('renders the row actions via the shared components', () => {
    cy.get('[data-cy="edit-btn"]').should('be.visible');
    cy.get('[data-cy="delete-btn"]').should('be.visible');
  });

  it('opens a confirm popup on delete and fires DELETE only on accept', () => {
    cy.get('[data-cy="delete-btn"]').click();
    cy.get('.p-confirmpopup, .p-confirm-popup, [role="alertdialog"]')
      .should('be.visible')
      .and('contain.text', 'Marco Rossi');
    cy.contains('.p-confirmpopup button, .p-confirm-popup button', 'Delete').click();
    cy.wait('@del');
  });

  it('does not delete when the popup is cancelled', () => {
    cy.get('[data-cy="delete-btn"]').click();
    cy.contains('.p-confirmpopup button, .p-confirm-popup button', 'Cancel').click();
    cy.get('.p-confirmpopup, .p-confirm-popup').should('not.exist');
    cy.get('@del.all').should('have.length', 0);
  });
});
