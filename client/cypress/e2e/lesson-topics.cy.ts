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
    from_belt: null,
    notes: null,
    video_url: null,
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

  it('on a held lesson, says what most of the room missed, and who, on request (#1860)', () => {
    stub({ lesson: lesson({ held: true }) });
    cy.intercept('GET', '/api/v1/lessons/room-gaps*', {
      statusCode: 200,
      body: {
        data: {
          present: 9,
          rows: [
            {
              id: 12,
              name: 'Triangle',
              parent_name: 'Closed guard',
              kind: 'both',
              lessons: 2,
              last_taught_on: '2026-10-14',
              missed: 6,
              unattributed: 0,
              athletes: [
                {
                  id: 1,
                  first_name: 'Mario',
                  last_name: 'Rossi',
                  belt: 'blue',
                  stripes: 2,
                  date_of_birth: null,
                  photo_url: null,
                  user_avatar_url: null,
                },
              ],
            },
          ],
        },
      },
    }).as('room');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@lesson');
    cy.get('[data-cy="attendance-topics"]').click();

    cy.wait('@room').then(({ request }) => {
      expect(request.url).to.contain('academy_class_id=3');
      expect(request.url).to.contain(`held_on=${TODAY_ISO}`);
    });
    cy.get('[data-cy="lesson-sheet-room"]')
      .should('be.visible')
      .and('contain.text', "6 of the 9 here tonight weren't there");

    cy.get('[data-cy="lesson-room-people-12"]').should('not.exist');
    cy.get('[data-cy="lesson-room-who-12"]').click();
    cy.get('[data-cy="lesson-room-people-12"]').should('contain.text', 'Mario Rossi');

    // One tap takes it, like a suggestion.
    cy.get('[data-cy="lesson-room-12"]').click();
    cy.get('[data-cy="lesson-chip-12"]').should('be.visible');
    cy.get('[data-cy="lesson-sheet-room"]').should('not.exist');
  });

  it("shows how a technique is taught here, and the last evening's notes as that evening's (#1862)", () => {
    stub();
    const NOTED_TREE = [
      {
        ...TREE[0],
        children: [
          topic({
            id: 11,
            parent_id: 1,
            name: 'Armbar',
            notes: 'Start from the S-mount; grip on the far elbow.',
            video_url: 'https://www.youtube.com/watch?v=abc123',
          }),
          topic({ id: 12, parent_id: 1, name: 'Triangle' }),
        ],
      },
      TREE[1],
    ];
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: NOTED_TREE },
    });
    // After `stub()`, so it wins over the `/lessons?*` glob that would match it too.
    cy.intercept('GET', '/api/v1/lessons/last-notes*', {
      statusCode: 200,
      body: {
        data: lesson({ held_on: '2026-10-07', notes: "Marco's first day back", held: true }),
      },
    }).as('lastNotes');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@lesson');
    cy.get('[data-cy="attendance-topics"]').click();
    cy.get('[data-cy="lesson-expand-1"]').click();

    cy.get('[data-cy="lesson-detail-toggle-tree-11"]').click();
    cy.wait('@lastNotes')
      .its('request.url')
      .should('contain', 'syllabus_topic_id=11')
      // Evenings before tonight only: tonight's own plan is not "the last".
      .and('contain', `before=${TODAY_ISO}`);

    cy.get('[data-cy="lesson-detail-tree-11"]').within(() => {
      cy.get('[data-cy="lesson-detail-notes"]').should('contain.text', 'S-mount');
      cy.get('[data-cy="lesson-detail-video"]')
        .should('have.attr', 'href', 'https://www.youtube.com/watch?v=abc123')
        .and('have.attr', 'target', '_blank');
      cy.get('[data-cy="lesson-detail-last-evening"]')
        .should('contain.text', 'Fundamentals')
        .and('contain.text', "Marco's first day back");
    });
    // Opening the details picks nothing.
    cy.get('[data-cy="lesson-topic-11"]').should('have.attr', 'aria-pressed', 'false');
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

  it('steps a week at a time, and saves to the week it lands on (#1859)', () => {
    stub();
    const weekday = (TODAY.getDay() + 2) % 7;
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [{ ...CLASS, weekday }] },
    });

    const next = new Date(
      TODAY.getFullYear(),
      TODAY.getMonth(),
      TODAY.getDate() + ((weekday - TODAY.getDay() + 7) % 7),
    );
    const weekAfter = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 7);
    const iso = (d: Date) =>
      [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.get('[data-cy="timetable-plan-3"]', { timeout: 15000 }).click();
    cy.wait('@lesson')
      .its('request.url')
      .should('contain', `held_on=${iso(next)}`);

    // The next occurrence is the first the timetable can plan: nothing before it.
    cy.get('[data-cy="lesson-sheet-prev"]').should('be.disabled');
    cy.get('[data-cy="lesson-sheet-next"]').click();
    cy.wait('@lesson')
      .its('request.url')
      .should('contain', `held_on=${iso(weekAfter)}`);
    cy.get('[data-cy="lesson-sheet-prev"]').should('not.be.disabled');

    // Something picked: the arrows hold, and say why.
    cy.get('[data-cy="lesson-expand-1"]').click();
    cy.get('[data-cy="lesson-topic-11"]').click();
    cy.get('[data-cy="lesson-sheet-next"]').should('be.disabled');
    cy.get('[data-cy="lesson-sheet-step-hint"]').should('be.visible');

    cy.intercept('PUT', '/api/v1/lessons/topics', {
      statusCode: 200,
      body: { data: lesson({ held_on: iso(weekAfter) }) },
    }).as('save');
    cy.get('[data-cy="lesson-sheet-save"]').click();

    cy.wait('@save').its('request.body.held_on').should('eq', iso(weekAfter));
  });
});
