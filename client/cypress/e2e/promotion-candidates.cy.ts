import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Who to promote? (#1841) — every active athlete with the facts side by side,
 * in the server's order, and nothing that reads as a verdict.
 */
const candidates = [
  {
    athlete: {
      id: 11,
      first_name: 'Marco',
      last_name: 'Rossi',
      belt: 'blue',
      stripes: 4,
      date_of_birth: '1990-03-15',
      photo_url: null,
      user_avatar_url: null,
    },
    belt_since: '2025-06-10',
    months_at_belt: 11,
    stripe_since: null,
    last_promoted_on: '2025-06-10',
    days_since_last_promotion: 339,
    sessions_since_last_promotion: 72,
    next: { kind: 'belt', belt: 'purple', stripes: 0 },
  },
  {
    athlete: {
      id: 12,
      first_name: 'Luca',
      last_name: 'Bianchi',
      belt: 'white',
      stripes: 1,
      date_of_birth: null,
      photo_url: null,
      user_avatar_url: null,
    },
    belt_since: '2026-01-15',
    months_at_belt: 4,
    stripe_since: '2026-03-02',
    last_promoted_on: '2026-03-02',
    days_since_last_promotion: 74,
    sessions_since_last_promotion: 1,
    next: { kind: 'stripe', belt: 'white', stripes: 2 },
  },
];

describe('Who to promote? (#1841)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    // The roster needs its pagination envelope (see athlete-import.cy.ts).
    cy.intercept('GET', '/api/v1/athletes?*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } },
    });
    cy.intercept('GET', '/api/v1/promotions/candidates', {
      statusCode: 200,
      body: { data: candidates },
    }).as('candidates');
  });

  it('opens from the roster and lists the facts in the order the server sent', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.get('[data-cy="ready-athletes-btn"]').click();
    cy.location('pathname').should('eq', '/dashboard/athletes/ready');
    cy.wait('@candidates');

    cy.get('[data-cy^="ready-row-"]').should('have.length', 2);
    cy.get('[data-cy^="ready-row-"]').first().should('have.attr', 'data-cy', 'ready-row-11');

    cy.get('[data-cy="ready-row-11"]').within(() => {
      cy.get('[data-cy="ready-months"]').should('have.text', '11 months on this belt');
      cy.get('[data-cy="ready-since"]').should('contain.text', '72 sessions since');
      cy.get('[data-cy="ready-next"]').should('contain.text', 'Purple');
    });
    cy.get('[data-cy="ready-row-12"] [data-cy="ready-since"]')
      .should('contain.text', 'Last stripe on')
      .and('contain.text', '1 session since');
  });

  it('opens an athlete on their promotion timeline', () => {
    cy.visitAuthenticated('/dashboard/athletes/ready');
    cy.wait('@candidates');

    cy.get('[data-cy="ready-row-11"] a[href="/dashboard/athletes/11/promotions"]').should('exist');
  });

  it('goes back to the roster', () => {
    cy.visitAuthenticated('/dashboard/athletes/ready');
    cy.wait('@candidates');

    cy.get('[data-cy="ready-back"]').click();
    cy.location('pathname').should('eq', '/dashboard/athletes');
  });
});
