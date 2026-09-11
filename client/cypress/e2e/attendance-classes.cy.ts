export {};

/**
 * The check-in with a timetable (#1562).
 *
 * The day's classes as chips, the one the clock points at already on; every
 * mark carries the class; a day with one class is named rather than asked; a
 * day with none is the page as it was before the timetable existed.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Test Academy',
      slug: 'test-academy-a1b2c3d4',
      address: null,
      logo_url: null,
    },
  },
};

const ATHLETES_TWO = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        belt: 'blue',
        stripes: 1,
        status: 'active',
        date_of_birth: null,
        joined_at: '2025-01-01',
        created_at: '2025-01-01T10:00:00+00:00',
      },
      {
        id: 2,
        first_name: 'Luigi',
        last_name: 'Verdi',
        belt: 'white',
        stripes: 0,
        status: 'active',
        date_of_birth: null,
        joined_at: '2025-01-01',
        created_at: '2025-01-01T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 2, total: 2 },
  },
};

const KIDS = {
  id: 1,
  name: 'Kids',
  weekday: 1,
  starts_at: '17:00',
  duration_minutes: 60,
  kind: 'gi',
};
const FUNDAMENTALS = {
  id: 2,
  name: 'Fundamentals',
  weekday: 1,
  starts_at: '19:00',
  duration_minutes: 60,
  kind: 'gi',
};
const ADVANCED = {
  id: 3,
  name: 'Advanced',
  weekday: 3,
  starts_at: '19:00',
  duration_minutes: 60,
  kind: 'gi',
};

// Monday 14 September 2026, 18:30 — half an hour before fundamentals. Only
// `Date` is faked: Angular's own timers must keep running.
const MONDAY_EVENING = new Date(2026, 8, 14, 18, 30).getTime();

describe('Check-in by class', () => {
  beforeEach(() => {
    cy.clock(MONDAY_EVENING, ['Date']);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO).as('athletes');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance*', { statusCode: 200, body: { data: [] } }).as(
      'attendance',
    );
  });

  it("offers the day's classes as chips and opens on the one the clock points at", () => {
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [KIDS, FUNDAMENTALS, ADVANCED] },
    }).as('classes');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@classes');
    cy.wait('@attendance').its('request.url').should('include', 'academy_class_id=2');

    // Two chips — Wednesday's class is not today's — and fundamentals is on.
    cy.get('[data-cy="attendance-class-picker"] .class-chip').should('have.length', 2);
    cy.get('[data-cy="attendance-class-2"]').should('have.attr', 'aria-checked', 'true');
    cy.get('[data-cy="attendance-class-1"]').should('have.attr', 'aria-checked', 'false');
  });

  it('sends the class with the mark, and re-reads the room when another chip is tapped', () => {
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [KIDS, FUNDAMENTALS] },
    }).as('classes');
    cy.intercept('POST', '/api/v1/attendance', (req) => {
      expect(req.body).to.deep.equal({ date: '2026-09-14', athlete_ids: [1], academy_class_id: 2 });
      req.reply({
        statusCode: 201,
        body: {
          data: [
            {
              id: 501,
              athlete_id: 1,
              lesson_id: 7,
              attended_on: '2026-09-14',
              source: 'instructor',
            },
          ],
        },
      });
    }).as('mark');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@classes');
    cy.wait('@attendance');

    cy.get('[data-cy="attendance-row-1"]').click();
    cy.wait('@mark');
    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'true');

    cy.get('[data-cy="attendance-class-1"]').click();
    cy.wait('@attendance').its('request.url').should('include', 'academy_class_id=1');
    // The roster was not re-read: only the records move with the class.
    cy.get('@athletes.all').should('have.length', 1);
    cy.get('[data-cy="attendance-class-1"]').should('have.attr', 'aria-checked', 'true');
  });

  it('names the class instead of asking when the day has one', () => {
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [FUNDAMENTALS, ADVANCED] },
    }).as('classes');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@classes');
    cy.wait('@attendance').its('request.url').should('include', 'academy_class_id=2');

    cy.get('[data-cy="attendance-class-picker"]').should('not.exist');
    cy.get('[data-cy="attendance-class-single"]').should('contain', 'Fundamentals · 19:00');
  });

  it('is the page it always was on a day with no class', () => {
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [ADVANCED] },
    }).as('classes');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@classes');
    cy.wait('@attendance').its('request.url').should('not.include', 'academy_class_id');

    cy.get('[data-cy="attendance-class-picker"]').should('not.exist');
    cy.get('[data-cy="attendance-class-single"]').should('not.exist');
    cy.get('[data-cy="attendance-row-1"]').should('be.visible');
  });
});
