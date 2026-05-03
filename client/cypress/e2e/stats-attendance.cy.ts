import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

describe('Stats — attendance trend tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/athletes**', MOCK_ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/stats/attendance/monthly?months=12', {
      statusCode: 200,
      body: {
        data: Array.from({ length: 12 }, (_, i) => ({
          month: `2026-${String(i + 1).padStart(2, '0')}`,
          attendance_count: (i + 1) * 100,
          training_days: 10,
        })),
      },
    }).as('attendanceMonthly');
  });

  it('navigates from sidebar Stats to the Attendance tab', () => {
    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-attendance"]').click();
    cy.url().should('include', '/dashboard/stats/attendance');
    cy.wait('@attendanceMonthly');
    cy.get('[data-cy="stats-attendance-chart"]').should('be.visible');
  });
});
