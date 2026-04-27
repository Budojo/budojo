import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const ATHLETE_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: null,
      phone_country_code: null,
      phone_national_number: null,
      date_of_birth: null,
      belt: 'blue' as const,
      stripes: 0,
      status: 'active' as const,
      joined_at: '2026-01-15',
      created_at: '2026-01-15T10:00:00+00:00',
    },
  },
};

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstOfThisMonth(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

function lastOfThisMonth(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function pickAttendedDay(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 10));
}

describe('attendance history tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes/42', ATHLETE_OK).as('athlete');
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');
  });

  it('renders the attendance grid and highlights the attended day', () => {
    const attendedDay = pickAttendedDay();
    cy.intercept(
      'GET',
      `/api/v1/athletes/42/attendance?from=${firstOfThisMonth()}&to=${lastOfThisMonth()}`,
      {
        statusCode: 200,
        body: {
          data: [
            {
              id: 1,
              athlete_id: 42,
              attended_on: attendedDay,
              notes: null,
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      },
    ).as('getHistory');

    cy.visitAuthenticated('/dashboard/athletes/42/attendance');
    cy.wait(['@academy', '@athlete', '@getHistory']);

    cy.get('[data-cy="attendance-history"]').should('exist');
    cy.get('[data-cy="attendance-counter"]').should('contain.text', '1 day this month');
    cy.get('[data-cy="attendance-day-attended"]').should('have.length', 1);
    cy.get('[data-cy="attendance-day-attended"]').first().should('have.attr', 'data-day', '10');
  });

  it('switches between Documents and Attendance by clicking the tab', () => {
    cy.intercept('GET', '/api/v1/athletes/42/attendance*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getHistory');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait(['@academy', '@athlete', '@getDocs']);

    cy.get('[data-cy="athlete-tab-attendance"]').click();
    cy.wait('@getHistory');
    cy.location('pathname').should('include', '/attendance');
    cy.get('[data-cy="attendance-history"]').should('be.visible');
  });

  it('opens a popover with notes when tapping a day with notes', () => {
    const attendedDay = pickAttendedDay();
    cy.intercept(
      'GET',
      `/api/v1/athletes/42/attendance?from=${firstOfThisMonth()}&to=${lastOfThisMonth()}`,
      {
        statusCode: 200,
        body: {
          data: [
            {
              id: 1,
              athlete_id: 42,
              attended_on: attendedDay,
              notes: 'Open mat — rolled with Lucia',
              created_at: null,
              deleted_at: null,
            },
          ],
        },
      },
    ).as('getHistory');

    cy.visitAuthenticated('/dashboard/athletes/42/attendance');
    cy.wait(['@academy', '@athlete', '@getHistory']);

    cy.get('[data-cy="attendance-day-attended"]').first().click();
    cy.get('[data-cy="attendance-notes"]').should('contain.text', 'Open mat — rolled with Lucia');
  });
});
