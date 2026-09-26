import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const MOCK_MONTHLY_PAYMENTS = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, '0')}`,
  currency: 'EUR',
  amount_cents: 10000 + i * 1000,
}));

const identity = (id: number, first_name: string, last_name: string) => ({
  id,
  first_name,
  last_name,
  belt: 'blue',
  stripes: 1,
  date_of_birth: null,
  photo_url: null,
  user_avatar_url: null,
});

const MOCK_ARREARS = [
  {
    athlete: identity(12, 'Marco', 'Rossi'),
    months_behind: 4,
    first_unpaid: '2026-03',
    owed_cents: 22000,
  },
  {
    athlete: identity(15, 'Giulia', 'Ferraro'),
    months_behind: 1,
    first_unpaid: '2026-08',
    owed_cents: 5500,
  },
];

describe('Stats — payments monthly revenue tab', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/athletes**', MOCK_ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/stats/payments/monthly?months=12', {
      statusCode: 200,
      body: { data: MOCK_MONTHLY_PAYMENTS },
    }).as('paymentsMonthly');
    cy.intercept('GET', '/api/v1/stats/payments/arrears', {
      statusCode: 200,
      body: { data: MOCK_ARREARS },
    }).as('paymentsArrears');
  });

  it('navigates to the Payments tab and renders the chart', () => {
    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-payments"]').click();
    cy.url().should('include', '/dashboard/stats/payments');
    cy.wait('@paymentsMonthly');
    cy.get('[data-cy="stats-payments-chart"]').should('be.visible');
  });

  it('lists who is behind under the chart, each opening their payments (#1760)', () => {
    cy.visitAuthenticated('/dashboard/stats/payments');
    cy.wait('@paymentsArrears');

    cy.get('[data-cy="arrears-total"]').should('contain.text', '2 athletes');
    cy.get('[data-cy="arrears-row-12"]')
      .should('contain.text', '4 months')
      .find('a')
      .should('have.attr', 'href', '/dashboard/athletes/12/payments');
  });
});
