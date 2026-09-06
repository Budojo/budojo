export {};

/**
 * The academy's monthly price list (#1381).
 *
 * Two surfaces, one feature: the owner builds the list on the academy form,
 * then puts an athlete on one of its lines from the athlete form. The second
 * half is what the alpha tester actually asked for — "so you know how much
 * they paid for the lessons they're due" — so both are covered here rather
 * than split across the two form specs.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Gracie Barra Torino',
      slug: 'gracie-barra-torino-a1b2c3d4',
      address: null,
      logo_url: null,
      monthly_fee_cents: 6500,
    },
  },
};

const TIER_TWO = { id: 1, label: '2 lezioni', amount_cents: 5500, lessons_per_week: 2 };
const TIER_THREE = { id: 2, label: '3 lezioni', amount_cents: 6500, lessons_per_week: 3 };

const ATHLETE_MARIO = {
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
  monthly_fee_cents: 6500,
};

function tiersResponse(tiers: object[]) {
  return {
    statusCode: 200,
    body: { data: tiers.map((t) => ({ ...t, athletes_count: 0 })) },
  };
}

describe('Academy price list', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
  });

  it('tells an academy with no tiers that everyone is on the flat fee', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([])).as('tiers');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@tiers');

    cy.get('[data-cy="fee-tier-empty"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="fee-tier-rows"]').should('not.exist');
  });

  it('lists the tiers with their prices', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([TIER_TWO, TIER_THREE])).as(
      'tiers',
    );

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@tiers');

    cy.get('[data-cy="fee-tier-row-1"]').scrollIntoView().should('contain', '2 lezioni');
    cy.get('[data-cy="fee-tier-amount-1"]').should('contain', '55');
    cy.get('[data-cy="fee-tier-amount-2"]').should('contain', '65');
  });

  it('creates a tier and sends euros as cents', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([])).as('tiers');
    cy.intercept('POST', '/api/v1/academy/fee-tiers', {
      statusCode: 201,
      body: { data: { ...TIER_TWO, athletes_count: 0 } },
    }).as('createTier');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@tiers');

    cy.get('[data-cy="fee-tier-add"]').scrollIntoView().click();
    cy.get('[data-cy="fee-tier-form-label"]').type('2 lezioni');
    cy.get('[data-cy="fee-tier-form-amount"] input').clear().type('55');
    cy.get('[data-cy="fee-tier-form-lessons"] input').clear().type('2');

    // The list reloads after the write — re-stub it with the created tier so
    // the assertion below reads the post-save state, not the empty one.
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([TIER_TWO])).as('tiersAfter');

    cy.get('[data-cy="fee-tier-form-save"]').scrollIntoView().click();

    cy.wait('@createTier').its('request.body').should('deep.equal', {
      label: '2 lezioni',
      amount_cents: 5500,
      lessons_per_week: 2,
    });
    cy.wait('@tiersAfter');
    cy.get('[data-cy="fee-tier-row-1"]').scrollIntoView().should('contain', '2 lezioni');
  });

  it('says how many athletes a tier carries before deleting it', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', {
      statusCode: 200,
      body: { data: [{ ...TIER_TWO, athletes_count: 3 }] },
    }).as('tiers');
    cy.intercept('DELETE', '/api/v1/academy/fee-tiers/1', { statusCode: 204 }).as('deleteTier');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@tiers');

    cy.get('[data-cy="fee-tier-remove-1"]').scrollIntoView().click();
    // The count is the point of the confirmation: three people's price changes.
    cy.get('.p-confirmpopup').should('contain', '3');

    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([])).as('tiersAfter');
    // Scoped to the popup's own accept button — `cy.contains('Delete')` would
    // match the trigger, which is still in the DOM.
    cy.get('.p-confirmpopup-accept-button').click();

    cy.wait('@deleteTier');
    cy.wait('@tiersAfter');
    cy.get('[data-cy="fee-tier-empty"]').scrollIntoView().should('be.visible');
  });
});

describe('Putting an athlete on a tier', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_MARIO },
    }).as('getAthlete');
  });

  it('hides the tier field entirely when the academy has no price list', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([])).as('tiers');

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@getAthlete');
    cy.wait('@tiers');

    // An empty dropdown is a choice the owner should never be asked to make.
    cy.get('[data-cy="athlete-form-fee-tier"]').should('not.exist');
  });

  it('offers each tier with its price and sends the chosen id', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([TIER_TWO, TIER_THREE])).as(
      'tiers',
    );
    cy.intercept('PUT', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: { ...ATHLETE_MARIO, fee_tier: TIER_TWO, monthly_fee_cents: 5500 } },
    }).as('updateAthlete');

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@getAthlete');
    cy.wait('@tiers');

    cy.get('[data-cy="athlete-form-fee-tier"]').scrollIntoView().click();
    // The price rides along in the option label — the owner is choosing an
    // amount, not a name.
    cy.get('.p-select-option').first().should('contain', '2 lezioni').and('contain', '55');
    cy.get('.p-select-option').first().click();

    cy.contains('button', 'Save changes').scrollIntoView().click();

    cy.wait('@updateAthlete').its('request.body.fee_tier_id').should('equal', 1);
  });

  it('pre-selects the tier the athlete is already on', () => {
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', tiersResponse([TIER_TWO, TIER_THREE])).as(
      'tiers',
    );
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: { ...ATHLETE_MARIO, fee_tier: TIER_THREE, monthly_fee_cents: 6500 } },
    }).as('getAthleteOnTier');

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@getAthleteOnTier');
    cy.wait('@tiers');

    cy.get('[data-cy="athlete-form-fee-tier"]').scrollIntoView().should('contain', '3 lezioni');
  });
});
