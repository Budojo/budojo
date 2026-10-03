import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';

/**
 * The money at the mat (#2036, PRD § 6.1): each phone check-in row says what
 * pays for the month, a month owed opens the payment sheet, and a payment is
 * two taps from the row. The runtime is the phone's (intercepted), the clock
 * fixed on a Thursday's class.
 */

// Thursday 1 October 2026: Gi at 19:00, an hour.
const GI = { id: 7, name: 'Gi', weekday: 4, starts_at: '19:00', duration_minutes: 60, kind: 'gi' };
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
  ...over,
});
const ANNA = athlete(1, 'Anna', { payment_coverage: 'none' });
const BRUNO = athlete(2, 'Bruno', {
  payment_coverage: 'none',
  monthly_fee_cents: 5500,
  billing_period_months: 3,
});
const CARLA = athlete(3, 'Carla', { payment_coverage: 'none', monthly_fee_cents: 0 });
const DARIO = athlete(4, 'Dario', {
  payment_coverage: 'carnet',
  active_carnet: { id: 40, code: 'C-40', remaining_entries: 3, expires_at: '2026-12-31' },
});
const ELENA = athlete(5, 'Elena', { payment_coverage: 'monthly' });
const ROOM = [ANNA, BRUNO, CARLA, DARIO, ELENA];

function phoneAtClass(): void {
  cy.viewport(390, 844);
  cy.clock(new Date('2026-10-01T19:05:00').getTime(), ['Date']);
  stubToday();
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: { data: { profile: 'mobile', capabilities: ['sync'] } },
  });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [GI] } });
  cy.intercept('GET', '/api/v1/athletes*', {
    statusCode: 200,
    body: {
      data: ROOM,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 100, to: 5, total: 5 },
    },
  });
  cy.intercept('GET', '/api/v1/attendance?*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/attendance/regulars*', {
    statusCode: 200,
    body: { data: [], meta: { occurrences: 0, occurrence_dates: [] } },
  });
  cy.intercept('GET', '/api/v1/lessons*', { statusCode: 200, body: { data: null } });
  // Anna is behind since September.
  cy.intercept('GET', '/api/v1/stats/payments/arrears', {
    statusCode: 200,
    body: {
      data: [
        {
          athlete: { id: 1, first_name: 'Anna', last_name: 'Rossi' },
          months_behind: 1,
          first_unpaid: '2026-09',
          owed_cents: 6000,
        },
      ],
    },
  });
  cy.intercept('GET', '/api/v1/athletes/1/payments?*', {
    statusCode: 200,
    body: { data: [], overdue_months: ['2026-09'] },
  });
  cy.visitAuthenticated('/dashboard/attendance');
  cy.get('[data-cy="attendance-mobile-list"]').should('be.visible');
}

const chip = (id: number) => cy.get(`[data-cy="attendance-pay-${id}"]`);
const reads = (words: string) => ($el: JQuery<HTMLElement>) =>
  expect($el.text().trim().replace(/\s+/g, ' ')).to.equal(words);

describe('The money at the mat (#2036)', () => {
  beforeEach(() => phoneAtClass());

  it('says on each row what pays for the month', () => {
    chip(1).should(reads('September'));
    chip(2).should(reads('October'));
    chip(3).should(reads('Free'));
    chip(4).should(reads('Carnet · 3'));
    chip(5).should(reads('Paid'));
    // Only a month owed is a button.
    chip(1).find('button').should('exist');
    chip(3).find('button').should('not.exist');
    // No page scrolls sideways under the chips.
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('asks for the month once the athlete who owes it is marked present', () => {
    cy.intercept('POST', '/api/v1/attendance', {
      statusCode: 201,
      body: { data: [{ id: 501, athlete_id: 1, lesson_id: 3, attended_on: '2026-10-01' }] },
    }).as('mark');

    cy.get('[data-cy="attendance-card-1"]').click();
    cy.wait('@mark');
    chip(1).should(reads('Ask September'));
  });

  it('records a payment in two taps, then the chip moves to the next month', () => {
    cy.intercept('POST', '/api/v1/athletes/1/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 90,
          athlete_id: 1,
          year: 2026,
          month: 9,
          period_months: 1,
          amount_cents: 6000,
          paid_at: '2026-10-01',
          payment_method: 'cash',
        },
      },
    }).as('pay');

    chip(1).find('button').click();
    cy.get('[data-cy="pay-sheet-month-2026-09"] input').should('be.checked');
    cy.get('[data-cy="pay-sheet-month-2026-10"]').should('be.visible');
    cy.get('[data-cy="pay-sheet-record"] button')
      .should('contain.text', 'Record €60.00 · cash')
      .click();

    cy.wait('@pay')
      .its('request.body')
      .should('deep.equal', { year: 2026, month: 9, period_months: 1, payment_method: 'cash' });
    cy.get('.p-dialog').should('not.exist');
    chip(1).should(reads('October'));
  });

  it('takes the payment back from the toast', () => {
    cy.intercept('POST', '/api/v1/athletes/1/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 90,
          athlete_id: 1,
          year: 2026,
          month: 9,
          period_months: 1,
          amount_cents: 6000,
          paid_at: '2026-10-01',
          payment_method: 'transfer',
        },
      },
    }).as('pay');
    cy.intercept('DELETE', '/api/v1/athletes/1/payments/2026/9', { statusCode: 204 }).as('undo');

    chip(1).find('button').click();
    cy.get('[data-cy="pay-sheet-method"]').contains('Bank transfer').click();
    cy.get('[data-cy="pay-sheet-record"] button').should('contain.text', '· bank transfer').click();
    cy.wait('@pay').its('request.body.payment_method').should('eq', 'transfer');

    cy.get('[data-cy="attendance-undo"]').click();
    cy.wait('@undo');
    chip(1).should(reads('September'));
  });

  it("prices a quarterly payer's whole quarter", () => {
    cy.intercept('POST', '/api/v1/athletes/2/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 91,
          athlete_id: 2,
          year: 2026,
          month: 10,
          period_months: 3,
          amount_cents: 16500,
          paid_at: '2026-10-01',
          payment_method: 'cash',
        },
      },
    }).as('pay');

    chip(2).find('button').click();
    cy.get('[data-cy="pay-sheet-month-2026-10"]').should(reads('October – December'));
    cy.get('[data-cy="pay-sheet-record"] button').should('contain.text', '€165.00').click();

    cy.wait('@pay').its('request.body.period_months').should('eq', 3);
    chip(2).should(reads('Paid'));
  });

  it('lets a tap on a quiet chip through to the row', () => {
    cy.intercept('POST', '/api/v1/attendance', {
      statusCode: 201,
      body: { data: [{ id: 503, athlete_id: 3, lesson_id: 3, attended_on: '2026-10-01' }] },
    }).as('mark');

    // A tap where the label sits, as a thumb lands: whatever is on top there
    // takes it. The label lets it through to the row's toggle.
    chip(3).then(($chip) => {
      const box = $chip[0].getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      cy.document().then((doc) => {
        expect(doc.elementFromPoint(x, y)?.closest('[data-cy="attendance-card-3"]')).to.exist;
      });
      cy.get('body').click(x, y);
    });
    cy.wait('@mark');
    cy.get('[data-cy="attendance-card-3"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('offers no undo for a payment the PC had already recorded', () => {
    cy.intercept('POST', '/api/v1/athletes/1/payments', {
      statusCode: 200,
      body: {
        data: {
          id: 80,
          athlete_id: 1,
          year: 2026,
          month: 9,
          period_months: 1,
          amount_cents: 6000,
          paid_at: '2026-09-28',
          payment_method: 'transfer',
        },
      },
    }).as('pay');

    chip(1).find('button').click();
    cy.get('[data-cy="pay-sheet-record"] button').click();
    cy.wait('@pay');
    cy.contains("Anna Rossi's payment was already recorded").should('be.visible');
    cy.get('[data-cy="attendance-undo"]').should('not.exist');
    chip(1).should(reads('October'));
  });
});
