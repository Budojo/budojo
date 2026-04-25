import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const SUMMARY_THREE = {
  statusCode: 200,
  body: {
    data: [
      { athlete_id: 1, first_name: 'Mario', last_name: 'Rossi', count: 8 },
      { athlete_id: 2, first_name: 'Luigi', last_name: 'Verdi', count: 3 },
      { athlete_id: 3, first_name: 'Marco', last_name: 'Bianchi', count: 12 },
    ],
  },
};

describe('monthly attendance summary', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', {
      statusCode: 200,
      body: {
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      },
    });
  });

  it('renders the dashboard widget with the top athletes by training days', () => {
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-widget"]').should('exist');
    cy.get('[data-cy="monthly-summary-total"]').should('contain.text', '23 training days');
    // Top 3 (sorted desc by count): 12, 8, 3 → Marco, Mario, Luigi
    cy.get('[data-cy="monthly-summary-row-3"]').should('contain.text', 'Marco Bianchi');
    cy.get('[data-cy="monthly-summary-row-1"]').should('contain.text', 'Mario Rossi');
  });

  it('navigates to the full summary page when the widget is clicked', () => {
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-widget"]').click();
    cy.wait('@summary'); // page also loads the same month
    cy.location('pathname').should('include', '/dashboard/attendance/summary');
    cy.get('[data-cy="monthly-summary-page"]').should('exist');
    cy.get('[data-cy="monthly-summary-table"]').should('exist');
  });

  it('filters the table by athlete name on the full page', () => {
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/attendance/summary');
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-filter"]').type('mar');
    cy.get('[data-cy="monthly-summary-table-row-3"]').should('exist'); // Marco
    cy.get('[data-cy="monthly-summary-table-row-1"]').should('exist'); // Mario
    cy.get('[data-cy="monthly-summary-table-row-2"]').should('not.exist'); // Luigi
  });
});
