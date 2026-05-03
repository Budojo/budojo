import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const MOCK_AGE_BANDS = {
  bands: [
    { code: 'junior', category: 'kids', min: 13, max: 15, count: 5 },
    { code: 'adult', category: 'adults', min: 18, max: null, count: 20 },
    { code: 'master_1', category: 'adults', min: 30, max: 35, count: 12 },
  ],
  total: 37,
  missing_dob: 2,
};

describe('Stats — athletes IBJJF age-bands tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/athletes**', MOCK_ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/stats/athletes/age-bands', {
      statusCode: 200,
      body: { data: MOCK_AGE_BANDS },
    }).as('ageBands');
  });

  it('navigates to the Athletes tab, renders the chart and shows the missing-dob count', () => {
    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-athletes"]').click();
    cy.url().should('include', '/dashboard/stats/athletes');
    cy.wait('@ageBands');
    cy.get('[data-cy="stats-athletes-chart"]').should('be.visible');
    cy.get('[data-cy="stats-athletes-missing"]').should('contain', '2');
  });
});
