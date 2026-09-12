import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * The academy's programme (#1563).
 *
 * Every call is intercepted, so what this proves is the client wiring: that
 * the tree opens and closes, that the shipped starter is one press away while
 * the programme is empty and gone once it is not, that a technique goes under
 * the position it was added from, and that a season tick reaches the server.
 */

const ACADEMY = { ...MOCK_ACADEMY, syllabus_topics_count: 2 };

const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

function topic(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    parent_id: null,
    name: 'Closed guard',
    kind: 'both',
    in_season: true,
    sort_order: 0,
    ...over,
  };
}

const ARMBAR = topic({ id: 11, parent_id: 1, name: 'Armbar', children: undefined });
const CROSS_COLLAR = topic({ id: 12, parent_id: 1, name: 'Cross collar choke', kind: 'gi' });
const CLOSED_GUARD = topic({ children: [ARMBAR, CROSS_COLLAR] });
const K_GUARD = topic({ id: 2, name: 'K guard', kind: 'nogi', sort_order: 1, children: [] });

function stub(topics: unknown[], academy: Record<string, unknown> = ACADEMY): void {
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: academy } }).as(
    'academy',
  );
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
  cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy/syllabus', {
    statusCode: 200,
    body: { data: topics },
  }).as('syllabus');
}

describe('Academy programme', () => {
  it('opens a position onto its techniques and closes it again', () => {
    stub([CLOSED_GUARD, K_GUARD]);

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    cy.get('[data-cy="page-header-count"]').should('contain.text', '2 techniques');
    // Collapsed by default — sixty headings are a programme, three hundred
    // techniques are a wall.
    cy.get('[data-cy="syllabus-topic-11"]').should('not.exist');

    cy.get('[data-cy="syllabus-toggle-1"]').click();
    cy.get('[data-cy="syllabus-topic-11"]').should('be.visible').and('contain.text', 'Armbar');
    // The kind is said only when it narrows something.
    cy.get('[data-cy="syllabus-topic-12"]').should('contain.text', 'Gi');
    cy.get('[data-cy="syllabus-topic-11"]').find('.chip').should('not.exist');

    cy.get('[data-cy="syllabus-toggle-1"]').click();
    cy.get('[data-cy="syllabus-topic-11"]').should('not.exist');
  });

  it('offers the shipped programme while the tree is empty, and drops it once seeded', () => {
    stub([], { ...ACADEMY, syllabus_topics_count: 0 });

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    cy.get('[data-cy="syllabus-empty"]').should('be.visible');
    cy.get('[data-cy="syllabus-empty-scratch"]').should('be.visible');
    cy.get('[data-cy="syllabus-add"]').should('not.exist');

    cy.intercept('POST', '/api/v1/academy/syllabus/seed', {
      statusCode: 201,
      body: { data: { written: 348 } },
    }).as('seed');
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: [CLOSED_GUARD, K_GUARD] },
    }).as('syllabusAfter');

    cy.get('[data-cy="syllabus-empty"]').find('button').click();

    cy.wait('@seed').its('request.body').should('deep.equal', {});
    cy.wait('@syllabusAfter');

    cy.get('[data-cy="syllabus-empty"]').should('not.exist');
    cy.get('[data-cy="syllabus-tree"]').should('be.visible');
    // Once there is a programme, the header carries the one way to add to it.
    cy.get('[data-cy="syllabus-add"]').should('be.visible');
  });

  it("adds a technique under the position it was added from, in that position's kind", () => {
    stub([CLOSED_GUARD, K_GUARD]);

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    cy.get('[data-cy="syllabus-add-under-2"]').click();
    cy.get('[data-cy="syllabus-dialog"]').should('be.visible').and('contain.text', 'K guard');
    cy.get('[data-cy="syllabus-form-kind"] [aria-pressed="true"]').should('contain.text', 'No-gi');

    cy.get('[data-cy="syllabus-form-name"]').should('be.visible').type('Saddle entry');

    cy.intercept('POST', '/api/v1/academy/syllabus', {
      statusCode: 201,
      body: { data: topic({ id: 21, parent_id: 2, name: 'Saddle entry', kind: 'nogi' }) },
    }).as('create');

    cy.get('[data-cy="syllabus-form-submit"]').click();

    cy.wait('@create').its('request.body').should('deep.equal', {
      name: 'Saddle entry',
      kind: 'nogi',
      parent_id: 2,
    });
  });

  it('takes a position out of season', () => {
    stub([CLOSED_GUARD, K_GUARD]);

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    cy.intercept('PATCH', '/api/v1/academy/syllabus/1', {
      statusCode: 200,
      body: { data: { ...CLOSED_GUARD, in_season: false } },
    }).as('season');

    cy.get('[data-cy="syllabus-season-1"]').click();

    cy.wait('@season').its('request.body').should('deep.equal', { in_season: false });
    cy.get('[data-cy="syllabus-position-1"]').should('have.class', 'position--off');
  });

  it('reaches the programme from the academy page', () => {
    stub([CLOSED_GUARD]);

    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-row-syllabus"]').should('contain.text', '2 techniques');
    cy.get('[data-cy="academy-syllabus-link"]').click();
    cy.location('pathname').should('eq', '/dashboard/academy/syllabus');
    cy.get('[data-cy="syllabus-page"]').should('exist');
  });
});
