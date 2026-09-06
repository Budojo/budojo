import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Entry carnets — owner flow (#1364).
 *
 * Every call is intercepted, so what this proves is the **client wiring**:
 * that selling posts the right payload, that the panel re-reads the list
 * afterwards and renders the new balance, that the register is fetched only
 * when opened, and that the offering gate hides the whole concept. Whether
 * attending a session actually spends an entry is server behaviour and is
 * covered by PEST — asserting it here against a stub would prove nothing.
 */

const ACADEMY = {
  ...MOCK_ACADEMY,
  monthly_fee_cents: 5000,
  carnet_price_cents: 7000,
  carnet_entries: 10,
};

const ATHLETE = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: null,
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2025-01-10',
  date_of_birth: null,
  address: null,
  paid_current_month: false,
  active_carnet: null,
};

function carnet(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    code: 'A7K2',
    athlete_id: 1,
    total_entries: 10,
    remaining_entries: 10,
    price_cents: 7000,
    purchased_at: '2026-01-10',
    valid_from: '2026-01-10',
    expires_at: '2027-01-10',
    is_active: true,
    ...over,
  };
}

/**
 * The panel sits below the athlete header, photo block and tab bar, so it
 * starts outside the viewport. Visibility assertions are about the element
 * being rendered and readable, not about where the page happens to be
 * scrolled — bring it into view first.
 */
function showPanel(): void {
  cy.get('[data-cy="carnet-panel"]', { timeout: 15000 }).scrollIntoView();
}

function stubCommon(academy: Record<string, unknown> = ACADEMY): void {
  cy.clearLocalStorage();
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: academy } });
  cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } });
  cy.intercept('GET', '/api/v1/athletes/1/payments*', { statusCode: 200, body: { data: [] } });
}

describe('Entry carnets — owner', () => {
  it('hides the whole concept when the academy does not sell carnets', () => {
    stubCommon({ ...ACADEMY, carnet_price_cents: null, carnet_entries: null });
    cy.intercept('GET', '/api/v1/athletes/1/carnets', { statusCode: 200, body: { data: [] } });

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    cy.get('[data-cy="payments-list"]', { timeout: 15000 }).should('exist');
    cy.get('[data-cy="carnet-panel"]').should('not.exist');
  });

  it('shows the empty state, then the new balance after a sale', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [] },
    }).as('carnetsEmpty');

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    cy.wait('@carnetsEmpty');
    showPanel();
    cy.get('[data-cy="carnet-empty"]').should('be.visible');

    // The sale, and the reload the panel does after it.
    cy.intercept('POST', '/api/v1/athletes/1/carnets', {
      statusCode: 201,
      body: { data: carnet() },
    }).as('sell');
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet()] },
    }).as('carnetsAfter');

    cy.get('[data-cy="carnet-sell-button"]').click();
    cy.get('[data-cy="carnet-sell-dialog"]').should('be.visible');
    cy.get('[data-cy="carnet-sell-confirm"]').click();

    // Left untouched, the date is omitted entirely — the server dates the
    // sale today. Sending a formatted empty value would be a 422.
    cy.wait('@sell').its('request.body').should('deep.equal', {});
    cy.wait('@carnetsAfter');

    showPanel();
    cy.get('[data-cy="carnet-balance-card"]').should('be.visible');
    cy.get('[data-cy="carnet-code"]').should('have.text', 'A7K2');
    cy.get('[data-cy="carnet-remaining"]').should('have.text', '10');
  });

  it('sends a back-dated purchase when the owner picks a date', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', { statusCode: 200, body: { data: [] } });
    cy.intercept('POST', '/api/v1/athletes/1/carnets', {
      statusCode: 201,
      body: { data: carnet() },
    }).as('sell');

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    cy.get('[data-cy="carnet-sell-button"]').click();
    cy.get('#carnet-purchased-at').click();
    // PrimeNG marks other-month days unselectable, so the first enabled cell
    // is the 1st of the month the picker opened on — a known date, which is
    // what makes the assertion below able to fail.
    cy.get('.p-datepicker-panel td span:not(.p-disabled)').first().click();
    cy.get('[data-cy="carnet-sell-confirm"]').click();

    // Asserting the exact day matters: a shape-only regex would stay green if
    // the ISO conversion switched to UTC and silently back-dated every sale by
    // a day for users east of Greenwich.
    const now = new Date();
    const expected = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`;
    cy.wait('@sell').its('request.body.purchased_at').should('equal', expected);
  });

  it('surfaces the running-low warning and shows the soonest-expiring carnet', () => {
    stubCommon();
    // A renewal bought before the old one ran out: the card must show the one
    // the next session actually spends, not the newest purchase.
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: {
        data: [
          carnet({ id: 9, code: 'NEWER', expires_at: '2027-08-01', purchased_at: '2026-08-01' }),
          carnet({ id: 4, code: 'SOON', expires_at: '2026-11-01', remaining_entries: 2 }),
        ],
      },
    });

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    cy.get('[data-cy="carnet-code"]').should('have.text', 'SOON');
    cy.get('[data-cy="carnet-low-balance"]').should('be.visible');
    // The other one is still valid, so it must not vanish from the page.
    cy.get('[data-cy="carnet-history-toggle"]').click();
    cy.get('[data-cy="carnet-history-list"]').should('contain.text', 'NEWER');
  });

  it('shows both dates on the card — sold on, and what it covers', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet({ purchased_at: '2026-09-04', valid_from: '2026-06-01' })] },
    });

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    // The sale date was missing entirely before #1380, and the two dates
    // differing is the whole point of the change.
    cy.get('[data-cy="carnet-sold-on"]').should('contain.text', '04/09/2026');
    cy.get('[data-cy="carnet-window"]').should('contain.text', '01/06/2026');
  });

  it('re-dates a carnet and takes the recomputed balance from the server', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet({ remaining_entries: 10 })] },
    });
    cy.intercept('PATCH', '/api/v1/athletes/1/carnets/7', {
      statusCode: 200,
      body: { data: carnet({ valid_from: '2026-05-01', remaining_entries: 7 }) },
    }).as('patch');
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet({ valid_from: '2026-05-01', remaining_entries: 7 })] },
    }).as('after');

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    cy.get('[data-cy="carnet-edit-validity"]').click();
    cy.get('[data-cy="carnet-validity-dialog"]').should('be.visible');
    cy.get('[data-cy="carnet-validity-confirm"]').click();

    cy.wait('@patch')
      .its('request.body.valid_from')
      .should('match', /^\d{4}-\d{2}-\d{2}$/);
    cy.wait('@after');
    // Pulling the window back claimed sessions already on the register: the
    // balance comes from the server, never recomputed here.
    showPanel();
    cy.get('[data-cy="carnet-remaining"]').should('have.text', '7');
  });

  it('says what a deletion costs before doing it', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet({ total_entries: 10, remaining_entries: 6 })] },
    });
    cy.intercept('DELETE', '/api/v1/athletes/1/carnets/7', { statusCode: 204 }).as('remove');

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    cy.get('[data-cy="carnet-delete"]').click();

    // Four entries spent, so four sessions lose their cover — shown before the
    // owner commits, not after.
    cy.get('.p-confirmpopup').should('contain.text', '(4)');
    // PrimeNG 22 renamed the popup's internals: `data-pc-name` is now the
    // camelCased `pcAcceptButton`, and the label is no longer a `.p-button-label`
    // span. The stable handle across both versions is the component's own
    // class, which is what the fee-tier spec already targets.
    cy.get('.p-confirmpopup-accept-button').click();
    cy.wait('@remove');
  });

  it('fetches the entry register only when it is opened', () => {
    stubCommon();
    cy.intercept('GET', '/api/v1/athletes/1/carnets', {
      statusCode: 200,
      body: { data: [carnet({ remaining_entries: 8 })] },
    });
    cy.intercept('GET', '/api/v1/athletes/1/carnets/7/entries', {
      statusCode: 200,
      body: {
        data: [
          { id: 1, carnet_id: 7, attendance_record_id: 11, used_on: '2026-03-09' },
          { id: 2, carnet_id: 7, attendance_record_id: 12, used_on: '2026-03-02' },
        ],
      },
    }).as('entries');

    cy.visitAuthenticated('/dashboard/athletes/1/payments');
    showPanel();
    cy.get('[data-cy="carnet-balance-card"]').should('be.visible');

    cy.get('@entries.all').should('have.length', 0);

    cy.get('[data-cy="carnet-register-toggle"]').click();
    cy.wait('@entries');
    cy.get('[data-cy="carnet-register-list"] li').should('have.length', 2);
  });
});

/**
 * Athlete portal — the surface this slice adds. Read-only: the athlete can
 * see the balance they paid for, and nothing else.
 */
describe('Entry carnets — athlete portal', () => {
  const ATHLETE_ME = {
    statusCode: 200,
    body: {
      data: {
        id: 2,
        first_name: 'Alice',
        last_name: 'User',
        full_name: 'Alice User',
        handle: 'alicebjj',
        email: 'alice@example.com',
        email_verified_at: '2026-01-01T00:00:00Z',
        avatar_url: null,
        role: 'athlete',
      },
    },
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy*', { statusCode: 200, body: { data: ACADEMY } });
    cy.intercept('GET', '/api/v1/auth/me*', ATHLETE_ME);
    cy.intercept('GET', '/api/v1/me/payments*', { statusCode: 200, body: { data: [] } });
  });

  it('shows the athlete their own remaining entries', () => {
    cy.intercept('GET', '/api/v1/me/carnets', {
      statusCode: 200,
      body: { data: [carnet({ athlete_id: 2, remaining_entries: 6 })] },
    });

    cy.visitAuthenticated('/dashboard/me/payments');
    cy.get('[data-cy="my-carnet-card"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy="my-carnet-code"]').should('have.text', 'A7K2');
    cy.get('[data-cy="my-carnet-remaining"]').should('have.text', '6');
    cy.get('[data-cy="my-carnet-low-balance"]').should('not.exist');
  });

  it('warns the athlete when the carnet is nearly spent', () => {
    cy.intercept('GET', '/api/v1/me/carnets', {
      statusCode: 200,
      body: { data: [carnet({ athlete_id: 2, remaining_entries: 2 })] },
    });

    cy.visitAuthenticated('/dashboard/me/payments');
    cy.get('[data-cy="my-carnet-low-balance"]', { timeout: 15000 }).should('be.visible');
  });

  it('keeps the payments grid when the carnet request fails', () => {
    cy.intercept('GET', '/api/v1/me/carnets', { statusCode: 500, body: {} });

    cy.visitAuthenticated('/dashboard/me/payments');
    cy.get('[data-cy="my-payments-grid"]', { timeout: 15000 }).should('be.visible');
    // The monthly ledger is what the page is for; a carnet failure hides the
    // card without taking the page down.
    cy.get('[data-cy="my-carnet-card"]').should('not.exist');
  });
});
