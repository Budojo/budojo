export {};

/**
 * Who usually comes and is not here (#1730).
 *
 * The check-in asks once per (day, class) for the class's regulars and
 * subtracts who it already has on the mat: a tick takes someone off the
 * panel with nothing asked of the server, and a chip asks again for the
 * other class.
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

function athlete(id: number, first_name: string, last_name: string, belt: string) {
  return {
    id,
    first_name,
    last_name,
    belt,
    stripes: 1,
    status: 'active',
    date_of_birth: null,
    phone_country_code: '+39',
    phone_national_number: '3471234567',
    joined_at: '2025-01-01',
    created_at: '2025-01-01T10:00:00+00:00',
  };
}

const MARIO = athlete(1, 'Mario', 'Rossi', 'blue');
const LUIGI = athlete(2, 'Luigi', 'Verdi', 'white');
// A regular who is not on the check-in's first page: the panel reads the
// whole roster's habits, not the twenty rows on screen.
const ANNA = athlete(3, 'Anna', 'Bianchi', 'purple');

const ATHLETES = {
  statusCode: 200,
  body: {
    data: [MARIO, LUIGI],
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
const FUNDAMENTALS = { ...KIDS, id: 2, name: 'Fundamentals', starts_at: '19:00' };

const MONDAYS = ['2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17'];

function regular(a: ReturnType<typeof athlete>, attended: number) {
  return {
    id: a.id,
    first_name: a.first_name,
    last_name: a.last_name,
    belt: a.belt,
    stripes: a.stripes,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    phone_country_code: a.phone_country_code,
    phone_national_number: a.phone_national_number,
    attended,
    last_attended_on: '2026-09-10',
  };
}

// Monday 14 September 2026, 18:30 — half an hour before fundamentals. Only
// `Date` is faked: Angular's own timers must keep running.
const MONDAY_EVENING = new Date(2026, 8, 14, 18, 30).getTime();

describe('Who usually comes and is not here', () => {
  beforeEach(() => {
    cy.clock(MONDAY_EVENING, ['Date']);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES);
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } });
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [KIDS, FUNDAMENTALS] },
    });
    // Luigi is already on the mat.
    cy.intercept('GET', '/api/v1/attendance?*', {
      statusCode: 200,
      body: {
        data: [
          { id: 90, athlete_id: 2, lesson_id: 5, attended_on: '2026-09-14', source: 'instructor' },
        ],
      },
    }).as('attendance');
  });

  it('names the regulars not ticked yet, and a tick takes one off without asking again', () => {
    cy.intercept('GET', '/api/v1/attendance/regulars*', {
      statusCode: 200,
      body: {
        data: [regular(MARIO, 4), regular(LUIGI, 4), regular(ANNA, 3)],
        meta: { occurrences: 4, occurrence_dates: MONDAYS },
      },
    }).as('regulars');
    cy.intercept('POST', '/api/v1/attendance', {
      statusCode: 201,
      body: {
        data: [
          { id: 501, athlete_id: 1, lesson_id: 5, attended_on: '2026-09-14', source: 'instructor' },
        ],
      },
    }).as('mark');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@regulars').then(({ request }) => {
      expect(request.url).to.include('date=2026-09-14');
      expect(request.url).to.include('academy_class_id=2');
    });

    // Folded, headed with who is missing — not with how many regulars exist.
    cy.get('[data-cy="missing-regulars-toggle"]')
      .should('have.attr', 'aria-expanded', 'false')
      .and('contain', '2 regulars missing');
    cy.get('[data-cy="missing-regulars-toggle"]').click();
    cy.get('[data-cy="missing-regular-1"]').should('contain', '4 of the last 4');
    cy.get('[data-cy="missing-regular-3"]').should('contain', '3 of the last 4');
    cy.get('[data-cy="missing-regular-2"]').should('not.exist');
    cy.get('[data-cy="missing-contact-3-whatsapp"]').should(
      'have.attr',
      'href',
      'https://wa.me/393471234567',
    );

    cy.get('[data-cy="attendance-row-1"]').click();
    cy.wait('@mark');

    cy.get('[data-cy="missing-regular-1"]').should('not.exist');
    cy.get('[data-cy="missing-regulars-toggle"]').should('contain', '1 regular missing');
    // The tap was a mark, not a reason to re-read the class's history.
    cy.get('@regulars.all').should('have.length', 1);
  });

  it('asks again for the other class when another chip is tapped', () => {
    cy.intercept('GET', '/api/v1/attendance/regulars*', {
      statusCode: 200,
      body: { data: [regular(ANNA, 4)], meta: { occurrences: 4, occurrence_dates: MONDAYS } },
    }).as('regulars');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@regulars');

    cy.get('[data-cy="attendance-class-1"]').click();
    cy.wait('@regulars').its('request.url').should('include', 'academy_class_id=1');
  });

  it('says it cannot tell yet, rather than that everyone is here, on a young class', () => {
    cy.intercept('GET', '/api/v1/attendance/regulars*', {
      statusCode: 200,
      body: { data: [], meta: { occurrences: 2, occurrence_dates: MONDAYS.slice(0, 2) } },
    }).as('regulars');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@regulars');

    cy.get('[data-cy="missing-regulars-not-enough"]').should(
      'contain',
      'Only 2 sessions of this class on record',
    );
    cy.get('[data-cy="missing-regulars-all-here"]').should('not.exist');
    cy.get('[data-cy="missing-regulars-toggle"]').should('not.exist');
  });
});
