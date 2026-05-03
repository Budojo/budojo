import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const MOCK_MONTHLY_PAYMENTS = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, '0')}`,
  currency: 'EUR',
  amount_cents: 10000 + i * 1000,
}));

describe('Stats — payments monthly revenue tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/athletes**', MOCK_ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/stats/payments/monthly?months=12', {
      statusCode: 200,
      body: { data: MOCK_MONTHLY_PAYMENTS },
    }).as('paymentsMonthly');
  });

  it('navigates to the Payments tab and renders the chart', () => {
    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-payments"]').click();
    cy.url().should('include', '/dashboard/stats/payments');
    cy.wait('@paymentsMonthly');
    cy.get('[data-cy="stats-payments-chart"]').should('be.visible');
  });
});
