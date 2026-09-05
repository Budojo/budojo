export {};

/**
 * Billing periods (#1382) — a payment that covers a quarter, a half or a year.
 *
 * The interesting assertion is not "the quarterly renders": it is that the
 * three months it covers all read *paid* while only one carries the amount.
 * Repeating €165 across three rows would treble the year's takings on a table
 * people read as a ledger.
 */

const YEAR = new Date().getUTCFullYear();

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Gracie Barra Torino',
      slug: 'gracie-barra-torino-a1b2c3d4',
      address: null,
      logo_url: null,
      monthly_fee_cents: 5500,
      fee_tier_count: 0,
    },
  },
};

const ATHLETE_QUARTERLY = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  fee_tier: null,
  monthly_fee_cents: 5500,
  billing_period_months: 3,
};

const QUARTERLY_FEB = {
  id: 7,
  athlete_id: 42,
  year: YEAR,
  month: 2,
  period_months: 3,
  amount_cents: 16500,
  paid_at: `${YEAR}-02-05T10:00:00Z`,
};

describe('A payment that covers a quarter', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_QUARTERLY },
    }).as('getAthlete');
    cy.intercept('GET', '/api/v1/athletes/42/carnets*', { statusCode: 200, body: { data: [] } });
  });

  it('reads paid on every month it covers, and unpaid on the next', () => {
    cy.intercept('GET', '/api/v1/athletes/42/payments*', {
      statusCode: 200,
      body: { data: [QUARTERLY_FEB] },
    }).as('payments');

    cy.visitAuthenticated('/dashboard/athletes/42/payments');
    cy.wait('@payments');

    for (const month of [2, 3, 4]) {
      cy.get(`[data-cy="payment-row-${month}"]`).scrollIntoView().should('contain', 'Paid');
    }
    cy.get('[data-cy="payment-row-5"]').scrollIntoView().should('contain', 'Unpaid');
  });

  it('carries the amount once and captions the range on all three months', () => {
    cy.intercept('GET', '/api/v1/athletes/42/payments*', {
      statusCode: 200,
      body: { data: [QUARTERLY_FEB] },
    }).as('payments');

    cy.visitAuthenticated('/dashboard/athletes/42/payments');
    cy.wait('@payments');

    cy.get('[data-cy="payment-row-2"]').scrollIntoView().should('contain', '165');
    cy.get('[data-cy="payment-row-3"]').should('not.contain', '165');
    cy.get('[data-cy="payment-row-4"]').should('not.contain', '165');

    // The caption is what ties the dash on March to the €165 on February.
    cy.get('[data-cy="payment-period-3"]')
      .scrollIntoView()
      .should('contain', 'February')
      .and('contain', 'April');
  });

  it('says what the whole period is before undoing it', () => {
    cy.intercept('GET', '/api/v1/athletes/42/payments*', {
      statusCode: 200,
      body: { data: [QUARTERLY_FEB] },
    }).as('payments');

    cy.visitAuthenticated('/dashboard/athletes/42/payments');
    cy.wait('@payments');

    // Clicking unmark on April removes February to April. Norman: show the
    // consequence before the act, not after.
    cy.get('[data-cy="payment-unmark-4"]').scrollIntoView().click();
    cy.get('.p-confirmpopup').should('contain', 'February').and('contain', 'April');
  });

  it('spreads a period bought last December into January and February', () => {
    cy.intercept('GET', '/api/v1/athletes/42/payments*', {
      statusCode: 200,
      body: {
        data: [
          {
            ...QUARTERLY_FEB,
            year: YEAR - 1,
            month: 12,
            paid_at: `${YEAR - 1}-12-05T10:00:00Z`,
          },
        ],
      },
    }).as('payments');

    cy.visitAuthenticated('/dashboard/athletes/42/payments');
    cy.wait('@payments');

    cy.get('[data-cy="payment-row-1"]').scrollIntoView().should('contain', 'Paid');
    cy.get('[data-cy="payment-row-2"]').should('contain', 'Paid');
    cy.get('[data-cy="payment-row-3"]').should('contain', 'Unpaid');
  });
});

describe('Choosing how often an athlete pays', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
  });

  it('pre-selects the period the athlete is on and sends the chosen one', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_QUARTERLY },
    }).as('getAthlete');
    cy.intercept('PUT', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: { ...ATHLETE_QUARTERLY, billing_period_months: 12 } },
    }).as('updateAthlete');

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-form-billing-period"]')
      .scrollIntoView()
      .should('contain', 'Quarterly');

    cy.get('[data-cy="athlete-form-billing-period"]').click();
    cy.get('.p-select-option').contains('Annual').click();

    cy.contains('button', 'Save changes').scrollIntoView().click();

    cy.wait('@updateAthlete').its('request.body.billing_period_months').should('equal', 12);
  });
});
