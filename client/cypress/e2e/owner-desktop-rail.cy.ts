import { MOCK_ACADEMY } from '../support/fixtures';

// Desktop (>=768px) social rail for the owner shell (#1112), mirroring the
// athlete rail (#1110). The mobile bottom-nav is covered in the component
// spec; this asserts the rail renders + behaves in a real browser at a
// desktop viewport.

const OWNER_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      first_name: 'Sensei',
      last_name: 'Mario',
      full_name: 'Sensei Mario',
      handle: 'senseimario',
      email: 'sensei@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
    },
  },
};

describe('Owner desktop social rail (#1112)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
    // Catch-all first — full paginated envelope so feed-like pages that read
    // meta.current_page don't throw; specific overrides are registered after,
    // so they win.
    cy.intercept('GET', '/api/v1/**', {
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
    });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me*', OWNER_ME);
  });

  it('renders the rail with the bottom-nav destinations + a prominent Create', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.get('[data-cy="owner-rail"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/academy"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/athletes"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/community"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/more"]').should('be.visible');
    cy.get('[data-cy="rail-create"]').should('be.visible');
  });

  it('opens the ➕ create sheet from the rail and dismisses it', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.get('[role="dialog"]').should('not.exist');

    cy.get('[data-cy="rail-create"]').click();
    cy.get('[role="dialog"]').should('exist');
    cy.get('[data-cy="create-attendance"]').should('be.visible');

    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('points the brand at the academy home + pins a profile chip linking to the More hub', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.get('a.rail__brand').should('have.attr', 'href', '/dashboard/academy');
    cy.get('[data-cy="rail-profile"]')
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard/more');
  });
});
