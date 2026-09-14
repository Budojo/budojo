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

  it('keeps the range when the chosen chip is tapped again (#1675)', () => {
    // `p-selectbutton`'s allowEmpty defaults to TRUE, so a second tap on the
    // chip already chosen deselected it and emitted null into a signal typed
    // `3 | 6 | 12`. The refetch went out as `?months=null`, the server's
    // `in:3,6,12` rule 422'd it, and the heatmap sat in its error state until
    // another range was picked.
    cy.intercept('GET', '/api/v1/stats/attendance/daily?months=null', (req) => {
      req.reply({ statusCode: 422, body: { message: 'The selected months is invalid.' } });
    }).as('nullRange');

    cy.visitAuthenticated('/dashboard/stats/attendance');
    cy.wait('@attendanceDaily');

    cy.get('[data-cy="stats-attendance-range"] p-togglebutton[data-p-checked="true"]')
      .should('have.length', 1)
      .click();

    // Still selected, still drawn, and the null request was never made.
    cy.get('[data-cy="stats-attendance-range"] p-togglebutton[data-p-checked="true"]').should(
      'have.length',
      1,
    );
    cy.get('[data-cy="stats-attendance-heatmap"]').should('be.visible');
    cy.get('@nullRange.all').should('have.length', 0);
  });
});
