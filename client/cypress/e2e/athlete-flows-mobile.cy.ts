import { MOCK_ACADEMY } from '../support/fixtures';
import { expectNoSidewaysScroll } from '../support/no-sideways-scroll';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * The first version's athlete flows on the phone (#2144, PRD § 6.1): the full
 * form, added and edited, the promotion history and the payment ledger, at
 * the phone's width and with its runtime. What the phone broke is pinned here:
 * the contact fields wider than the screen, which slid the form sideways, and
 * row actions and a way back under the 48px floor.
 */

const ATHLETE = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2025-01-10',
  created_at: '2025-01-10T10:00:00+00:00',
  is_self: false,
  monthly_fee_cents: 6000,
  payment_coverage: 'none',
};

const promotion = (id: number, over: Record<string, unknown>) => ({
  id,
  kind: 'stripe',
  from_belt: null,
  to_belt: null,
  from_stripes: 1,
  to_stripes: 2,
  belt_at_event: 'blue',
  recorded_at: '2026-09-01T10:00:00+00:00',
  recorded_by: { id: 1, full_name: 'Owner User' },
  ...over,
});

/** At least 48 x 48 CSS px, the touch floor. */
function expectPressable(selector: string): void {
  cy.get(selector).should(($el) => {
    const box = $el[0].getBoundingClientRect();
    expect(box.width, `${selector} width`).to.be.at.least(48);
    expect(box.height, `${selector} height`).to.be.at.least(48);
  });
}

describe('The athlete flows on the phone (#2144)', () => {
  beforeEach(() => {
    // Inside the ledger's season whatever day CI runs: October 2026.
    cy.clock(new Date('2026-10-25T12:00:00').getTime(), ['Date']);
    cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/runtime', {
      statusCode: 200,
      body: { data: { profile: 'mobile', capabilities: ['sync'] } },
    });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } });
  });

  it('adds an athlete with a form that never slides sideways', () => {
    cy.intercept('POST', '/api/v1/athletes', {
      statusCode: 201,
      body: { data: { ...ATHLETE, id: 99 } },
    }).as('create');
    cy.visitAuthenticated('/dashboard/athletes/new');
    cy.get('[data-cy="athlete-form"]').should('be.visible');

    // The contact row held a field 441px wide on a 375px phone: the page
    // stayed at the screen's width and the column under it scrolled.
    expectNoSidewaysScroll();
    // A date picker opening, or a field taking focus, scrolled it into view sideways.
    cy.get('#date_of_birth').click();
    cy.get('body').type('{esc}');
    cy.get('#phone_national_number').focus();
    cy.get('main.main').should(($main) => expect($main[0].scrollLeft).to.equal(0));
    expectNoSidewaysScroll();

    cy.get('#first_name').type('Luca');
    cy.get('#last_name').type('Bianchi');
    cy.get('button[type="submit"]').scrollIntoView();
    expectPressable('button[type="submit"]');
    cy.get('button[type="submit"]').click();
    cy.wait('@create')
      .its('request.body')
      .should('deep.include', { first_name: 'Luca', last_name: 'Bianchi', belt: 'white' });
  });

  it('edits an athlete, the form as wide as the phone', () => {
    cy.intercept('PUT', '/api/v1/athletes/1', {
      statusCode: 200,
      body: { data: { ...ATHLETE, first_name: 'Marco' } },
    }).as('update');
    cy.visitAuthenticated('/dashboard/athletes/1/edit');
    cy.get('#first_name').should('have.value', 'Mario');
    expectNoSidewaysScroll();

    cy.get('#first_name').clear().type('Marco');
    cy.get('button[type="submit"]').scrollIntoView().click();
    cy.wait('@update').its('request.body').should('deep.include', { first_name: 'Marco' });
  });

  it('corrects the promotion history with targets a thumb can press', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', {
      statusCode: 200,
      body: {
        data: [
          promotion(9, {}),
          promotion(8, {
            kind: 'belt',
            from_belt: 'white',
            to_belt: 'blue',
            from_stripes: 4,
            to_stripes: 0,
            recorded_at: '2025-06-01T10:00:00+00:00',
          }),
        ],
        meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 2, total: 2 },
      },
    });
    cy.visitAuthenticated('/dashboard/athletes/1/promotions');

    // A row's pencil and bin sit side by side: each at the floor, or a thumb
    // meant for one presses the other.
    expectPressable('[data-cy="promotion-edit-9"]');
    expectPressable('[data-cy="promotion-delete-9"]');
    // The way back paints 33px and presses 48: a point 7px above it is still it.
    cy.get('[data-cy="athlete-detail-back"]').then(($back) => {
      const box = $back[0].getBoundingClientRect();
      const doc = $back[0].ownerDocument;
      const x = box.left + box.width / 2;
      for (const y of [box.top - 7, box.bottom + 7]) {
        expect(doc.elementFromPoint(x, y)?.closest('a'), `the way back at y=${y}`).to.equal(
          $back[0],
        );
      }
    });
    expectNoSidewaysScroll();

    cy.get('[data-cy="promotions-add"]').click();
    // The panel, not the `p-dialog` host, which holds only fixed boxes (#2154).
    cy.get('[data-cy="promotion-create-dialog"] [role="dialog"]').should('be.visible');
    expectNoSidewaysScroll();
    cy.get('[data-cy="promotion-create-cancel"]').click();
    cy.get('[data-cy="promotion-create-dialog"] [role="dialog"]').should('not.exist');
  });

  it('marks a month paid from the ledger, the popup inside the screen', () => {
    cy.intercept('GET', '/api/v1/athletes/1/payments*', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 5,
            athlete_id: 1,
            year: 2026,
            month: 9,
            period_months: 1,
            amount_cents: 6000,
            paid_at: '2026-09-05T10:00:00Z',
            method: 'cash',
          },
        ],
      },
    });
    cy.intercept('POST', '/api/v1/athletes/1/payments', {
      statusCode: 201,
      body: {
        data: {
          id: 6,
          athlete_id: 1,
          year: 2026,
          month: 10,
          period_months: 1,
          amount_cents: 6000,
          paid_at: '2026-10-25T10:00:00Z',
          method: null,
        },
      },
    }).as('pay');
    cy.visitAuthenticated('/dashboard/athletes/1/payments');

    expectPressable('[data-cy="payments-prev-year"]');
    expectPressable('[data-cy="payments-next-year"]');
    expectNoSidewaysScroll();

    cy.get('[data-cy="payment-card-mark-10"]').scrollIntoView().click();
    cy.get('[data-cy="mark-paid-confirm"]').should('be.visible');
    cy.get('.p-confirmpopup').should(($popup) => {
      // At rest: a popup still scaling in would measure smaller than it is.
      expect(getComputedStyle($popup[0]).transform, 'popup at rest').to.be.oneOf([
        'none',
        'matrix(1, 0, 0, 1, 0, 0)',
      ]);
      const box = $popup[0].getBoundingClientRect();
      expect(box.left, 'popup left').to.be.at.least(0);
      expect(box.right, 'popup right').to.be.at.most(VIEWPORT_PHONE.width);
    });
    cy.get('.p-confirmpopup').contains('button', 'Mark paid').click();
    cy.wait('@pay').its('request.body').should('deep.include', { year: 2026, month: 10 });
  });
});
