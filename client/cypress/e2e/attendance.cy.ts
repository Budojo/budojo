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
        phone: null,
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
        phone: null,
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
});
