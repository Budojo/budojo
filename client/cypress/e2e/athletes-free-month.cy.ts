import { MOCK_ACADEMY } from '../support/fixtures';
import { expectNoSidewaysScroll } from '../support/no-sideways-scroll';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * A month let off, from the payment chip (#2167): someone who helped with the
 * gym does not pay October. «Si allena gratis» is said once, over its two
 * answers, this month or from now on.
 */

const JACOPO = {
  id: 7,
  first_name: 'Jacopo',
  last_name: 'Neri',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt: 'blue',
  stripes: 1,
  status: 'active',
  joined_at: '2024-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  monthly_fee_cents: 9500,
  fee_override_cents: null,
  paid_current_month: false,
  payment_coverage: 'none',
};

function rosterOf(athlete: typeof JACOPO) {
  return {
    statusCode: 200,
    body: {
      data: [athlete],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
    },
  };
}

describe('A month let off, from the payment chip (#2167)', () => {
  beforeEach(() => {
    cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
    cy.clock(new Date(2026, 9, 20, 10).getTime(), ['Date']);
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...MOCK_ACADEMY, monthly_fee_cents: 9500 } },
    }).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', /\/api\/v1\/athletes(\?|$)/, rosterOf(JACOPO)).as('athletes');
  });

  it('says «Trains free» once, lets October off on a yes, and the chip says so', () => {
    cy.intercept('POST', '/api/v1/athletes/7/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 50,
          athlete_id: 7,
          year: 2026,
          month: 10,
          period_months: 1,
          amount_cents: 0,
          paid_at: '2026-10-20T00:00:00+00:00',
          payment_method: null,
          waived: true,
        },
      },
    }).as('waive');
    cy.intercept('GET', '/api/v1/athletes/7', {
      statusCode: 200,
      body: { data: { ...JACOPO, paid_current_month: true, payment_coverage: 'waived' } },
    });
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="athlete-card-coverage-7"]').should('contain.text', 'Unpaid').click();

    cy.get('.p-menu').should('be.visible');
    cy.get('.p-menu .p-menu-submenu-label').then(($labels) => {
      expect([...$labels].map((label) => label.textContent?.trim())).to.deep.equal([
        'Jacopo Neri',
        'Trains free',
      ]);
    });
    cy.get('.p-menu').should('not.contain.text', 'Trains free Trains free');
    cy.get('.p-menu [role="menuitem"]').then(($items) => {
      expect([...$items].map((item) => item.textContent?.trim())).to.deep.equal([
        'Mark paid',
        'Open payments',
        'Just October',
        'Always',
      ]);
    });
    // A screen reader never hears the heading: each item carries it.
    cy.contains('.p-menu [role="menuitem"]', 'Just October').should(
      'have.attr',
      'aria-label',
      'Trains free: just October',
    );
    cy.contains('.p-menu [role="menuitem"]', 'Always').should(
      'have.attr',
      'aria-label',
      'Trains free: always',
    );
    expectNoSidewaysScroll();

    cy.contains('.p-menu [role="menuitem"]', 'Just October').click();
    cy.get('.p-confirmpopup').should(
      'contain.text',
      "Jacopo Neri doesn't pay for October? The month is free and stays off the unpaid list.",
    );
    cy.contains('.p-confirmpopup button', 'Free month').click();

    cy.wait('@waive').its('request.body').should('deep.equal', {
      year: 2026,
      month: 10,
      waived: true,
    });
    cy.get('[data-cy="athlete-card-coverage-7"]').should('contain.text', 'Free month');
  });

  it('offers the way back on a month let off, and nothing to pay', () => {
    cy.intercept(
      'GET',
      /\/api\/v1\/athletes(\?|$)/,
      rosterOf({ ...JACOPO, paid_current_month: true, payment_coverage: 'waived' }),
    ).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="athlete-card-coverage-7"]').should('contain.text', 'Free month').click();

    cy.get('.p-menu [role="menuitem"]').then(($items) => {
      expect([...$items].map((item) => item.textContent?.trim())).to.deep.equal([
        'Open payments',
        'Undo October',
        'Always',
      ]);
    });
  });
});
