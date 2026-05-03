import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

describe('Stats — attendance heatmap tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/athletes**', MOCK_ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/stats/attendance/daily?months=3', {
      statusCode: 200,
      body: {
        data: [
          { date: '2026-04-10', count: 3 },
          { date: '2026-04-15', count: 8 },
          { date: '2026-05-01', count: 5 },
        ],
      },
    }).as('attendanceDaily');
  });

  it('navigates from sidebar Stats to the Attendance tab and renders the heatmap', () => {
    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-attendance"]').click();
    cy.url().should('include', '/dashboard/stats/attendance');
    cy.wait('@attendanceDaily');
    cy.get('[data-cy="stats-attendance-heatmap"]').should('be.visible');
  });
});
