import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * What a lesson covered (#1564).
 *
 * Every call is intercepted, so what this proves is the client wiring: that
 * the check-in carries a topic row for the selected class, that the picker
 * opens on its three groups and searches across both levels, that saving
 * sends the whole list, and that planning from the timetable lands on the
 * next occurrence rather than on today.
 */

const TODAY = new Date();
const TODAY_ISO = [
  TODAY.getFullYear(),
  String(TODAY.getMonth() + 1).padStart(2, '0'),
  String(TODAY.getDate()).padStart(2, '0'),
].join('-');

const ACADEMY = { ...MOCK_ACADEMY, classes_count: 1, syllabus_topics_count: 3 };

/** One class, today, so the check-in picks it without a choice to make. */
const CLASS = {
  id: 3,
  name: 'Fundamentals',
  weekday: TODAY.getDay(),
  starts_at: '19:00',
  duration_minutes: 60,
  kind: 'gi',
};

const ATHLETES = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2025-01-10',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
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

const TREE = [
  topic({
    id: 1,
    name: 'Closed guard',
    children: [
      topic({ id: 11, parent_id: 1, name: 'Armbar' }),
      topic({ id: 12, parent_id: 1, name: 'Triangle' }),
    ],
  }),
  topic({ id: 2, name: 'Mount', sort_order: 1, children: [] }),
];

function lesson(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    academy_class_id: 3,
    held_on: TODAY_ISO,
    name: 'Fundamentals',
    starts_at: '19:00',
    kind: 'gi',
    notes: null,
    held: false,
    topics: [],
    ...over,
  };
}

function stub(opts: { lesson?: unknown; recent?: unknown[] } = {}): void {
  cy.clearLocalStorage();
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [CLASS] } });
  cy.intercept('GET', '/api/v1/academy/syllabus', { statusCode: 200, body: { data: TREE } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES);
  cy.intercept('GET', '/api/v1/attendance*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/lessons/recent-topics', {
    statusCode: 200,
    body: { data: opts.recent ?? [] },
  });
  cy.intercept('GET', '/api/v1/lessons?*', {
    statusCode: 200,
    body: { data: opts.lesson ?? null },
  }).as('lesson');
}

describe('Lesson topics — check-in', () => {
  it('invites a first tag, opens the picker, and saves the whole list', () => {
    stub();

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@lesson');

    cy.get('[data-cy="attendance-topics"]')
      .should('be.visible')
      .and('contain.text', 'Nothing tagged yet');

    cy.get('[data-cy="attendance-topics"]').click();
    cy.get('[data-cy="lesson-sheet"]').should('be.visible');

    // Opens on the positions, not on every technique (Hick's law).
    cy.get('[data-cy="lesson-expand-1"]').should('be.visible');
    cy.get('[data-cy="lesson-topic-11"]').should('not.exist');

    cy.get('[data-cy="lesson-expand-1"]').click();
    cy.get('[data-cy="lesson-topic-11"]').should('be.visible').click();

    cy.intercept('PUT', '/api/v1/lessons/topics', {
      statusCode: 200,
      body: {
        data: lesson({
          topics: [
            {
              id: 11,
              name: 'Armbar',
              kind: 'both',
              parent_id: 1,
              parent_name: 'Closed guard',
              deleted: false,
            },
          ],
        }),
      },
    }).as('save');

    cy.get('[data-cy="lesson-sheet-save"]').click();

    cy.wait('@save').then(({ request }) => {
      expect(request.body.academy_class_id).to.eq(3);
      expect(request.body.held_on).to.eq(TODAY_ISO);
      expect(request.body.topic_ids).to.deep.eq([11]);
    });

    // The row now summarises what was saved, without a re-read. Closed is
    // asserted on the mask: `<p-dialog>` keeps its host element either way.
    cy.get('.p-dialog-mask').should('not.exist');
    cy.get('[data-cy="attendance-topics"]').should('contain.text', 'Armbar');
  });

  it('searches across positions and techniques at once', () => {
    stub();

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@lesson');
    cy.get('[data-cy="attendance-topics"]').click();

    cy.get('[data-cy="lesson-sheet-search"]').type('guard');
    // The position and everything under it.
    cy.get('[data-cy="lesson-sheet-results"]').within(() => {
      cy.contains('Closed guard').should('exist');
      cy.contains('Armbar').should('exist');
      cy.contains('Triangle').should('exist');
      cy.contains('Mount').should('not.exist');
    });

    cy.get('[data-cy="lesson-sheet-search-clear"]').click();
    cy.get('[data-cy="lesson-sheet-results"]').should('not.exist');
    cy.get('[data-cy="lesson-sheet-tree"]').should('be.visible');
  });

  it('offers what was taught lately, and shows a departed topic locked', () => {
    stub({
      recent: [
        {
          id: 12,
          name: 'Triangle',
          kind: 'both',
          parent_id: 1,
          parent_name: 'Closed guard',
          deleted: false,
        },
      ],
      lesson: lesson({
        held: true,
        topics: [
          {
            id: 99,
            name: 'Worm guard',
            kind: 'gi',
            parent_id: null,
            parent_name: null,
            deleted: true,
          },
        ],
      }),
    });

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@lesson');
    cy.get('[data-cy="attendance-topics"]').click();

    cy.get('[data-cy="lesson-sheet-state"]').should('contain.text', 'Held');
    cy.get('[data-cy="lesson-recent-12"]').should('be.visible').and('contain.text', 'Triangle');
    // It left the programme: still named, never editable here.
    cy.get('[data-cy="lesson-chip-gone-99"]')
      .should('be.visible')
      .and('contain.text', 'Worm guard');
  });
});

describe('Lesson topics — planning from the timetable', () => {
  it('plans the next occurrence of a class, not today', () => {
    stub();
    // A class on a weekday that is not today, so "next occurrence" is a real
    // future date rather than an alias for today.
    const weekday = (TODAY.getDay() + 2) % 7;
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [{ ...CLASS, weekday }] },
    });

    const expected = new Date(
      TODAY.getFullYear(),
      TODAY.getMonth(),
      TODAY.getDate() + ((weekday - TODAY.getDay() + 7) % 7),
    );
    const expectedIso = [
      expected.getFullYear(),
      String(expected.getMonth() + 1).padStart(2, '0'),
      String(expected.getDate()).padStart(2, '0'),
    ].join('-');

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.get('[data-cy="timetable-plan-3"]', { timeout: 15000 }).click();

    cy.get('[data-cy="lesson-sheet"]').should('be.visible');
    cy.wait('@lesson').its('request.url').should('contain', `held_on=${expectedIso}`);
    cy.get('[data-cy="lesson-sheet-state"]').should('not.exist');
  });
});
