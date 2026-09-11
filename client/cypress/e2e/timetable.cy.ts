export {};

/**
 * The weekly timetable (#1562).
 *
 * Where the academy's classes get names, days and times. The check-in reads
 * the result; this spec covers the page itself — the empty state, the week,
 * and the one form that adds, edits and removes a class.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Gracie Barra Torino',
      slug: 'gracie-barra-torino-a1b2c3d4',
      address: null,
      logo_url: null,
      classes_count: 2,
    },
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
  duration_minutes: 75,
  kind: 'gi',
};
const OPEN_MAT = {
  id: 3,
  name: 'Open mat',
  weekday: 6,
  starts_at: null,
  duration_minutes: null,
  kind: 'both',
};

function classes(list: object[]) {
  return { statusCode: 200, body: { data: list } };
}

describe('Weekly timetable', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('invites the owner to add the first class when the week is empty', () => {
    cy.intercept('GET', '/api/v1/academy/classes', classes([])).as('classes');

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.wait('@classes');

    cy.get('[data-cy="timetable-empty"]').should('be.visible');
    cy.get('[data-cy="timetable-week"]').should('not.exist');
    // One call to action, not two: the header button yields to the empty state.
    cy.get('[data-cy="timetable-add"]').should('not.exist');
  });

  it('draws the whole week, Monday first, with every class under its day', () => {
    cy.intercept('GET', '/api/v1/academy/classes', classes([KIDS, FUNDAMENTALS, OPEN_MAT])).as(
      'classes',
    );

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.wait('@classes');

    cy.get('[data-cy="page-header-count"]').should('contain', '3 classes a week');
    cy.get('[data-cy="timetable-week"] .day').should('have.length', 7);
    cy.get('[data-cy="timetable-week"] .day')
      .first()
      .should('have.attr', 'data-cy', 'timetable-day-1');
    cy.get('[data-cy="timetable-week"] .day')
      .last()
      .should('have.attr', 'data-cy', 'timetable-day-0');

    cy.get('[data-cy="timetable-day-1"] .slot').should('have.length', 2);
    cy.get('[data-cy="timetable-class-2"]')
      .should('contain', 'Fundamentals')
      .and('contain', '19:00 – 20:15');
    cy.get('[data-cy="timetable-class-3"]').should('contain', 'No fixed time');

    // A rest day says so, and still offers to add something.
    cy.get('[data-cy="timetable-day-2"]')
      .should('have.class', 'day--rest')
      .and('contain', 'No class');
    cy.get('[data-cy="timetable-add-2"]').should('be.visible');
  });

  it("adds a class from a day's plus, with that day already chosen", () => {
    cy.intercept('GET', '/api/v1/academy/classes', classes([KIDS])).as('classes');
    cy.intercept('POST', '/api/v1/academy/classes', (req) => {
      expect(req.body).to.deep.equal({
        name: 'Advanced',
        weekday: 4,
        starts_at: '20:00',
        duration_minutes: 90,
        kind: 'nogi',
      });
      req.reply({ statusCode: 201, body: { data: { id: 9, ...req.body } } });
    }).as('create');

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.wait('@classes');

    cy.get('[data-cy="timetable-add-4"]').click();
    cy.get('[data-cy="timetable-dialog"]').should('be.visible');
    // Thursday is pre-selected from the "+" that opened the form.
    cy.get('[data-cy="timetable-form-day-4"]').should('have.attr', 'aria-checked', 'true');

    cy.get('[data-cy="timetable-form-name"]').type('Advanced');
    // Not `type()`: on a native time input it drives the browser's own
    // hour / minute / AM-PM segments, and in Electron's en-US locale the
    // value sometimes never reaches the control — green locally, red on
    // #1574's CI with `starts_at: null`. Set the value the way the control
    // reads it and fire the event Angular listens for.
    cy.get('[data-cy="timetable-form-time"]')
      .invoke('val', '20:00')
      .trigger('input')
      .should('have.value', '20:00');
    cy.get('[data-cy="timetable-form-duration"] input').clear().type('90');
    cy.get('[data-cy="timetable-form-kind"]').contains('No-gi').click();

    cy.intercept(
      'GET',
      '/api/v1/academy/classes',
      classes([
        KIDS,
        {
          id: 9,
          name: 'Advanced',
          weekday: 4,
          starts_at: '20:00',
          duration_minutes: 90,
          kind: 'nogi',
        },
      ]),
    ).as('reload');
    cy.get('[data-cy="timetable-form-save"]').click();
    cy.wait('@create');
    cy.wait('@reload');

    // The host element stays in the DOM; the mask is the honest signal for
    // "closed" (see the promotions spec).
    cy.get('.p-dialog-mask').should('not.exist');
    cy.get('[data-cy="timetable-class-9"]').should('contain', 'Advanced');
  });

  it('edits a class in place and removes it after a confirm', () => {
    cy.intercept('GET', '/api/v1/academy/classes', classes([KIDS])).as('classes');
    cy.intercept('PATCH', '/api/v1/academy/classes/1', (req) => {
      expect(req.body.starts_at).to.equal('17:30');
      req.reply({ statusCode: 200, body: { data: { ...KIDS, starts_at: '17:30' } } });
    }).as('update');
    cy.intercept('DELETE', '/api/v1/academy/classes/1', { statusCode: 204 }).as('remove');

    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.wait('@classes');

    cy.get('[data-cy="timetable-class-1"]').click();
    cy.get('[data-cy="timetable-form-name"]').should('have.value', 'Kids');
    cy.get('[data-cy="timetable-form-time"]')
      .should('have.value', '17:00')
      .invoke('val', '17:30')
      .trigger('input')
      .should('have.value', '17:30');
    cy.get('[data-cy="timetable-form-save"]').click();
    cy.wait('@update');
    cy.wait('@classes');

    cy.get('[data-cy="timetable-class-1"]').click();
    cy.get('[data-cy="timetable-form-remove"]').click();
    // The confirm names what stays: the lessons already held.
    cy.get('.p-confirmpopup').should('contain', 'Kids').and('contain', 'already held');
    cy.get('.p-confirmpopup').contains('button', 'Remove').click();
    cy.wait('@remove');

    // The host element stays in the DOM; the mask is the honest signal for
    // "closed" (see the promotions spec).
    cy.get('.p-dialog-mask').should('not.exist');
  });

  it('is reachable from the academy page, which says how many classes there are', () => {
    cy.intercept('GET', '/api/v1/academy/classes', classes([KIDS, FUNDAMENTALS])).as('classes');

    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-row-timetable"]').should('contain', '2 classes a week');
    cy.get('[data-cy="academy-timetable-link"]').should('contain', 'Manage').click();

    cy.location('pathname').should('eq', '/dashboard/academy/timetable');
    cy.wait('@classes');
    cy.get('[data-cy="timetable-week"]').should('be.visible');
  });
});
