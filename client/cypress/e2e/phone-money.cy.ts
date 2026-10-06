import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';
import { VIEWPORT_PIXEL_8_PRO } from '../support/viewports';

/**
 * «Soldi» on the phone (#2132, PRD § 6.1): who still has to pay this month,
 * tonight's people first, each row a tap from the check-in's payment sheet.
 * The runtime is the phone's (intercepted), the clock fixed on a Thursday's
 * class.
 */

const athlete = (id: number, first_name: string, over: Record<string, unknown>) => ({
  id,
  first_name,
  last_name: 'Rossi',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt: 'white',
  stripes: 0,
  status: 'active',
  joined_at: '2025-01-10',
  created_at: '2025-01-10T10:00:00+00:00',
  photo_url: null,
  user_avatar_url: null,
  is_self: false,
  monthly_fee_cents: 6000,
  billing_period_months: 1,
  billing_floor: '2025-01-01',
  active_carnet: null,
  payment_coverage: 'none',
  ...over,
});
// Anna owes October and September; Bruno owes October and is on the mat;
// Carla has paid; Dario paid October but owes July and August.
const ANNA = athlete(1, 'Anna', {});
const BRUNO = athlete(2, 'Bruno', {});
const CARLA = athlete(3, 'Carla', { payment_coverage: 'monthly' });
const DARIO = athlete(4, 'Dario', { payment_coverage: 'monthly' });
const ROOM = [ANNA, BRUNO, CARLA, DARIO];

const arrears = (id: number, first_name: string, months: string[]) => ({
  athlete: { id, first_name, last_name: 'Rossi' },
  months_behind: months.length,
  first_unpaid: months[0],
  unpaid_months: months,
  owed_cents: 6000 * months.length,
});

function onThePhone(): void {
  cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
  cy.clock(new Date('2026-10-01T19:05:00').getTime(), ['Date']);
  stubToday();
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: { data: { profile: 'mobile', capabilities: ['sync'] } },
  });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes*', {
    statusCode: 200,
    body: {
      data: ROOM,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 200, to: 4, total: 4 },
    },
  });
  cy.intercept('GET', '/api/v1/attendance?*', {
    statusCode: 200,
    body: { data: [{ id: 501, athlete_id: 2, lesson_id: 3, attended_on: '2026-10-01' }] },
  });
  cy.intercept('GET', '/api/v1/stats/payments/arrears', {
    statusCode: 200,
    body: {
      data: [arrears(4, 'Dario', ['2026-07', '2026-08']), arrears(1, 'Anna', ['2026-09'])],
    },
  });
  cy.intercept('GET', '/api/v1/athletes/2/payments?*', {
    statusCode: 200,
    body: { data: [], overdue_months: [] },
  });
  cy.visitAuthenticated('/dashboard/money');
  cy.get('[data-cy="money"]').should('be.visible');
}

const row = (id: number) => cy.get(`[data-cy="money-row-${id}"]`);
const reads = (words: string) => ($el: JQuery<HTMLElement>) =>
  expect($el.text().trim().replace(/\s+/g, ' ')).to.equal(words);

describe('Soldi on the phone (#2132)', () => {
  beforeEach(() => onThePhone());

  it("lists who still has to pay, tonight's people first", () => {
    cy.contains('h1', 'Who still has to pay').should('be.visible');
    cy.get('[data-cy="bottomnav-money"]').should('be.visible');

    cy.get('[data-cy="money-group-tonight"]').within(() => {
      cy.contains('h2', 'On the mat tonight');
      row(2).find('.money-row__lead').should(reads('October'));
    });
    cy.get('[data-cy="money-group-others"]').within(() => {
      row(1).find('.money-row__lead').should(reads('October'));
      row(1).find('.money-row__also').should(reads('also September'));
      row(4).find('.money-row__lead').should(reads('July'));
      row(4).find('.money-row__also').should(reads('also August'));
    });
    row(3).should('not.exist');

    // The shell scrolls `main`, not the document: measure both.
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('main.main').should(($main) => {
      expect($main[0].scrollWidth).to.be.at.most($main[0].clientWidth);
    });
  });

  it('takes the row off once paid, and the undo puts it back', () => {
    cy.intercept('POST', '/api/v1/athletes/2/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 90,
          athlete_id: 2,
          year: 2026,
          month: 10,
          period_months: 1,
          amount_cents: 6000,
          paid_at: '2026-10-01',
          payment_method: 'cash',
        },
      },
    }).as('pay');
    cy.intercept('DELETE', '/api/v1/athletes/2/payments/2026/10', { statusCode: 204 }).as('undo');

    row(2).click();
    cy.get('[data-cy="pay-sheet-month-2026-10"] input').should('be.checked');
    cy.get('[data-cy="pay-sheet-record"] button').should('contain.text', 'Record €60.00').click();
    cy.wait('@pay');

    row(2).should('not.exist');
    cy.get('[data-cy="money-undo"]').should(($undo) => {
      expect($undo[0].getBoundingClientRect().height).to.be.at.least(48);
    });
    cy.get('[data-cy="money-undo"]').click();
    cy.wait('@undo');
    row(2).should('be.visible');
  });
});
