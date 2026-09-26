import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

// Match the component's `toLocalDateString()` — `toISOString()` shifts
// to UTC and can land on the wrong calendar day in non-UTC timezones,
// which makes assertions on the request body flaky around midnight.
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const TODAY = toLocalDateString(new Date());

const ATHLETES_TWO = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: null,
        belt: 'blue' as const,
        stripes: 0,
        status: 'active' as const,
        joined_at: '2025-01-01',
        created_at: '2025-01-01T10:00:00+00:00',
      },
      {
        id: 2,
        first_name: 'Luigi',
        last_name: 'Verdi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: null,
        belt: 'white' as const,
        stripes: 0,
        status: 'active' as const,
        joined_at: '2025-01-01',
        created_at: '2025-01-01T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      path: '',
      per_page: 20,
      to: 2,
      total: 2,
    },
  },
};

describe('Daily attendance check-in', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO).as('athletes');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // No timetable (#1562): the page behaves exactly as it did before one existed.
    cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance*', { statusCode: 200, body: { data: [] } }).as(
      'getDaily',
    );
  });

  it('renders todays attendance page with empty present-set', () => {
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@academy', '@athletes', '@getDaily']);

    cy.get('[data-cy="attendance-page"]').should('exist');
    cy.get('[data-cy="attendance-list"]').should('exist');
    cy.get('[data-cy="attendance-row-1"]').should('contain', 'Mario Rossi');
    cy.get('[data-cy="attendance-row-2"]').should('contain', 'Luigi Verdi');
    // No one present yet — both rows show the empty-circle indicator.
    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'false');
  });

  it('marks an athlete present optimistically + the POST fires + the row flips', () => {
    cy.intercept('POST', '/api/v1/attendance', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          data: [
            {
              id: 999,
              athlete_id: req.body.athlete_ids[0],
              attended_on: req.body.date,
              notes: null,
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      });
    }).as('mark');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@academy', '@athletes', '@getDaily']);

    cy.get('[data-cy="attendance-row-1"]').click();
    // Optimistic: aria-pressed flipped immediately.
    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'true');

    cy.wait('@mark')
      .its('request.body')
      .should('deep.include', {
        date: TODAY,
        athlete_ids: [1],
      });
  });

  it('un-marks an already-present athlete via DELETE', () => {
    // Seed today as having Mario present.
    cy.intercept('GET', '/api/v1/attendance*', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 555,
            athlete_id: 1,
            attended_on: TODAY,
            notes: null,
            created_at: null,
            deleted_at: null,
          },
        ],
      },
    }).as('getDailySeed');
    cy.intercept('DELETE', '/api/v1/attendance/555', { statusCode: 204 }).as('unmark');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@academy', '@athletes', '@getDailySeed']);

    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-cy="attendance-row-1"]').click();
    // Optimistic: row flips to not-present immediately.
    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'false');
    cy.wait('@unmark');
  });

  it('shows an Undo button on the toast and reverts the mark when tapped', () => {
    cy.intercept('POST', '/api/v1/attendance', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          data: [
            {
              id: 777,
              athlete_id: req.body.athlete_ids[0],
              attended_on: req.body.date,
              notes: null,
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      });
    }).as('mark');
    cy.intercept('DELETE', '/api/v1/attendance/777', { statusCode: 204 }).as('undoDelete');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@academy', '@athletes', '@getDaily']);

    cy.get('[data-cy="attendance-row-1"]').click();
    cy.wait('@mark');

    // Toast appears with Undo button.
    cy.get('[data-cy="attendance-undo"]').should('be.visible').click();

    // The undo fires the DELETE on the record we just created.
    cy.wait('@undoDelete');
    cy.get('[data-cy="attendance-row-1"]').should('have.attr', 'aria-pressed', 'false');
  });

  it('checks three people in at the door, one name and Enter each (#1930)', () => {
    const bianchi = {
      ...ATHLETES_TWO.body.data[0],
      id: 3,
      first_name: 'Anna',
      last_name: 'Bianchi',
    };
    const everyone = [...ATHLETES_TWO.body.data, bianchi];
    const byName: Record<string, typeof everyone> = {
      rossi: [everyone[0]],
      verdi: [everyone[1]],
      bianchi: [bianchi],
    };
    const page = (data: typeof everyone) => ({
      ...ATHLETES_TWO.body,
      data,
      meta: { ...ATHLETES_TWO.body.meta, to: data.length, total: data.length },
    });

    // Each search answers its one person. The whole register comes back slowly,
    // so the next name is typed while the reload after a tick is still on its
    // way: the queue at the door does not wait for the list.
    cy.intercept('GET', '/api/v1/athletes*', (req) => {
      const q = req.query['q'];
      if (typeof q === 'string' && byName[q]) {
        req.reply({ statusCode: 200, body: page(byName[q]) });
        return;
      }
      req.reply({ statusCode: 200, body: page(everyone), delay: 800 });
    }).as('athletes');
    cy.intercept('POST', '/api/v1/attendance', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          data: [
            {
              id: 880 + Number(req.body.athlete_ids[0]),
              athlete_id: req.body.athlete_ids[0],
              attended_on: req.body.date,
              notes: null,
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      });
    }).as('mark');

    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@academy', '@athletes', '@getDaily']);

    // Each one typed and entered in one breath, faster than the search's pause.
    cy.get('[data-cy="attendance-search-input"]').type('rossi{enter}');
    cy.wait('@mark').its('request.body.athlete_ids').should('deep.equal', [1]);
    cy.get('[data-cy="attendance-search-input"]').should('have.value', '').type('verdi{enter}');
    cy.wait('@mark').its('request.body.athlete_ids').should('deep.equal', [2]);
    cy.get('[data-cy="attendance-search-input"]').should('have.value', '').type('bianchi{enter}');
    cy.wait('@mark').its('request.body.athlete_ids').should('deep.equal', [3]);

    // The box ready for a fourth, and the whole register back with all three on it.
    cy.get('[data-cy="attendance-search-input"]').should('have.value', '').and('have.focus');
    [1, 2, 3].forEach((id) =>
      cy.get(`[data-cy="attendance-row-${id}"]`).should('have.attr', 'aria-pressed', 'true'),
    );
  });
});
