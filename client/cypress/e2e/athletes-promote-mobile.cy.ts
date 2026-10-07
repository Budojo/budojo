import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * A promotion from the athlete's row on the phone (#2045, PRD § 6.1): the
 * card's ⋮ offers it, the next step on the ladder is proposed, and the card's
 * belt moves once it is recorded.
 */

const MARIO = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  is_self: false,
};
const page = {
  data: [MARIO],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
};

describe('A promotion from the row, on the phone (#2045)', () => {
  beforeEach(() => {
    cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', /\/api\/v1\/athletes(\?|$)/, { statusCode: 200, body: page }).as(
      'athletes',
    );
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // The proposal is the server's (#2045): the rule «Chi promuovere?» uses.
    cy.intercept('GET', '/api/v1/athletes/1/next-step', {
      statusCode: 200,
      body: { data: { kind: 'stripe', belt: 'blue', stripes: 3 } },
    }).as('next');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);
  });

  it('proposes the next stripe, records it, and moves the card', () => {
    cy.intercept('PUT', '/api/v1/athletes/1', {
      statusCode: 200,
      body: { data: { ...MARIO, stripes: 3 } },
    }).as('promote');

    cy.get('[data-cy="athlete-card-menu-1"]').click();
    cy.get('.p-menu').contains('Promote').click();

    cy.wait('@next');
    cy.get('[data-cy="promote-from"]').should('contain.text', 'Blue · 2');
    cy.get('[data-cy="promote-to"]').should('contain.text', 'Blue · 3');
    // The keyboard starts on Record, not on the ✕ where Enter would close.
    cy.focused().parents('[data-cy="promote-submit"]').should('exist');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('[data-cy="promote-submit"] button').click();

    cy.wait('@promote').its('request.body').should('deep.equal', { belt: 'blue', stripes: 3 });
    cy.get('.p-dialog').should('not.exist');
    cy.contains('Mario Rossi: Blue · 3').should('be.visible');
    cy.focused().should('have.attr', 'data-cy', 'athlete-card-menu-1');
  });

  it('records the next belt when it is picked instead', () => {
    cy.intercept('PUT', '/api/v1/athletes/1', {
      statusCode: 200,
      body: { data: { ...MARIO, belt: 'purple', stripes: 0 } },
    }).as('promote');

    cy.get('[data-cy="athlete-card-menu-1"]').click();
    cy.get('.p-menu').contains('Promote').click();
    cy.get('[data-cy="promote-belt"]').click();
    cy.get('.p-select-option').contains('Purple').click();
    // A new belt starts with no stripes.
    cy.get('[data-cy="promote-to"]').should('contain.text', 'Purple · 0');
    cy.get('[data-cy="promote-submit"] button').click();

    cy.wait('@promote').its('request.body').should('deep.equal', { belt: 'purple', stripes: 0 });
  });
});
