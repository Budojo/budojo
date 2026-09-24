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
    from_belt: null,
    notes: null,
    video_url: null,
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
    cy.get('[data-cy="syllabus-empty-secondary"]').should('be.visible');
    cy.get('[data-cy="syllabus-add"]').should('not.exist');

    cy.intercept('POST', '/api/v1/academy/syllabus/seed', {
      statusCode: 201,
      body: { data: { written: 348 } },
    }).as('seed');
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: [CLOSED_GUARD, K_GUARD] },
    }).as('syllabusAfter');

    cy.get('[data-cy="syllabus-empty-cta"]').click();

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
      from_belt: null,
      notes: null,
      video_url: null,
    });
  });

  it('puts a technique in the programme from a belt, then shows what that belt is expected to know (#1861)', () => {
    stub([CLOSED_GUARD, K_GUARD]);

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    // Nothing names a belt yet: there is nothing for a filter to narrow.
    cy.get('[data-cy="syllabus-belt-filter"]').should('not.exist');

    cy.get('[data-cy="syllabus-toggle-1"]').click();
    cy.get('[data-cy="syllabus-topic-edit-12"]').click();
    cy.get('[data-cy="syllabus-form-from-belt"]').click();
    cy.get('.p-select-option')
      .contains(/^\s*Purple\s*$/)
      .click();

    const GRADED_COLLAR = { ...CROSS_COLLAR, from_belt: 'purple' };
    cy.intercept('PATCH', '/api/v1/academy/syllabus/12', {
      statusCode: 200,
      body: { data: GRADED_COLLAR },
    }).as('grade');
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: [{ ...CLOSED_GUARD, children: [ARMBAR, GRADED_COLLAR] }, K_GUARD] },
    }).as('reload');
    cy.get('[data-cy="syllabus-form-submit"]').click();

    cy.wait('@grade').its('request.body').should('deep.equal', {
      name: 'Cross collar choke',
      kind: 'gi',
      from_belt: 'purple',
      notes: null,
      video_url: null,
    });
    cy.wait('@reload');

    // The row says so, and the filter appears.
    cy.get('[data-cy="syllabus-topic-12"] [data-cy="syllabus-belt"]').should(
      'contain.text',
      'Purple',
    );
    cy.get('[data-cy="syllabus-belt-filter"]').click();
    cy.get('.p-select-option')
      .contains(/^\s*Blue\s*$/)
      .click();

    // A blue belt is expected to know the armbar, not the purple-belt choke.
    cy.get('[data-cy="syllabus-belt-summary"]').should(
      'contain.text',
      '1 technique expected up to the Blue belt',
    );
    cy.get('[data-cy="syllabus-topic-11"]').should('be.visible');
    cy.get('[data-cy="syllabus-topic-12"]').should('not.exist');
  });

  it('writes how a technique is taught here and where it came from (#1862)', () => {
    stub([CLOSED_GUARD, K_GUARD]);

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    cy.get('[data-cy="syllabus-toggle-1"]').click();
    cy.get('[data-cy="syllabus-topic-edit-11"]').click();

    cy.get('[data-cy="syllabus-form-notes"]').type('Start from the S-mount.');
    // Plain http is refused at the field before anything is sent.
    cy.get('[data-cy="syllabus-form-video"]').type('http://youtube.com/watch?v=abc123');
    cy.get('[data-cy="syllabus-form-submit"]').click();
    cy.get('[data-cy="syllabus-form-video-error"]').should('contain.text', 'https://');

    cy.intercept('PATCH', '/api/v1/academy/syllabus/11', {
      statusCode: 200,
      body: { data: { ...ARMBAR, notes: 'Start from the S-mount.' } },
    }).as('notes');
    cy.get('[data-cy="syllabus-form-video"]').clear().type('https://youtube.com/watch?v=abc123');
    cy.get('[data-cy="syllabus-form-video-error"]').should('not.exist');
    cy.get('[data-cy="syllabus-form-submit"]').click();

    cy.wait('@notes').its('request.body').should('deep.include', {
      notes: 'Start from the S-mount.',
      video_url: 'https://youtube.com/watch?v=abc123',
    });
  });

  it('offers a karate academy its own modes and its own example (#1803)', () => {
    stub([], {
      ...ACADEMY,
      martial_art: 'karate',
      training_modes: ['kata', 'kumite'],
      syllabus_programmes: ['karate-goju-ryu'],
    });

    cy.visitAuthenticated('/dashboard/academy/syllabus');
    cy.wait('@syllabus');

    // Writing one's own, beside the Goju-ryu seed (#1805).
    cy.get('[data-cy="syllabus-empty-cta"]').should(
      'contain.text',
      'Start from the Goju-ryu programme',
    );
    cy.get('[data-cy="syllabus-empty-secondary"] button').click();
    cy.get('[data-cy="syllabus-form-kind"]')
      .should('contain.text', 'Kata and kumite')
      .and('not.contain.text', 'Gi');
    cy.get('[data-cy="syllabus-dialog"]').should(
      'contain.text',
      'Saifa is kata, sanbon kumite is kumite.',
    );

    cy.get('[data-cy="syllabus-form-name"]').should('be.visible').type('Kata');
    cy.get('[data-cy="syllabus-form-kind"]')
      .contains(/^\s*Kata\s*$/)
      .click();
    cy.intercept('POST', '/api/v1/academy/syllabus', {
      statusCode: 201,
      body: { data: topic({ id: 21, name: 'Kata', kind: 'kata', children: [] }) },
    }).as('create');
    cy.get('[data-cy="syllabus-form-submit"]').click();

    cy.wait('@create').its('request.body.kind').should('eq', 'kata');
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
