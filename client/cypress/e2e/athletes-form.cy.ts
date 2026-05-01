import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: null,
      last_page: 1,
      path: '',
      per_page: 20,
      to: null,
      total: 0,
    },
  },
};
const ATHLETE_MARIO = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue' as const,
  stripes: 2,
  status: 'active' as const,
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
};

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------

describe('Athlete create form', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    // M3.4 widget fires on /dashboard/athletes load; stub to keep logs clean.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('opens the create form from the athletes list', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('[data-cy="add-athlete-btn"]').click();
    cy.url().should('include', '/dashboard/athletes/new');
    cy.get('h1').should('contain', 'Add athlete');
    cy.get('input[id="first_name"]').should('exist');
    cy.get('input[id="last_name"]').should('exist');
  });

  it('shows validation errors on empty submit', () => {
    cy.visitAuthenticated('/dashboard/athletes/new');
    cy.wait('@academy');

    cy.contains('button', 'Create athlete').click();
    // The address fieldset (#72b) made the form taller than the default
    // 720-px Cypress viewport. After clicking the bottom submit, the
    // top-of-form errors are clipped by `.main { overflow-y: auto }`,
    // so we scroll each into view before the visibility assertion.
    cy.contains('First name is required').scrollIntoView().should('be.visible');
    cy.contains('Last name is required').scrollIntoView().should('be.visible');
  });

  it("successfully creates an athlete and redirects to the new athlete's detail", () => {
    cy.intercept('POST', '/api/v1/athletes', {
      statusCode: 201,
      body: { data: { ...ATHLETE_MARIO, id: 99 } },
    }).as('createAthlete');
    // The detail page mounts after the redirect and fetches the
    // freshly-created athlete. Stub it so the spec doesn't depend
    // on a live backend.
    cy.intercept('GET', '/api/v1/athletes/99', {
      statusCode: 200,
      body: { data: { ...ATHLETE_MARIO, id: 99 } },
    });
    cy.intercept('GET', '/api/v1/athletes/99/documents*', {
      statusCode: 200,
      body: { data: [] },
    });

    cy.visitAuthenticated('/dashboard/athletes/new');
    cy.wait('@academy');

    cy.get('input[id="first_name"]').type('Mario');
    cy.get('input[id="last_name"]').type('Rossi');
    cy.get('input[id="email"]').type('mario@example.com');
    cy.contains('button', 'Create athlete').click();

    cy.wait('@createAthlete').its('request.body').should('deep.include', {
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@example.com',
      belt: 'white',
      stripes: 0,
      status: 'active',
    });

    // After #281 we land on the new athlete's detail (default child
    // route Documents) instead of bouncing back to the list.
    cy.url().should('match', /\/dashboard\/athletes\/99\/documents$/);
  });

  it('surfaces a 422 server error in the top banner', () => {
    cy.intercept('POST', '/api/v1/athletes', {
      statusCode: 422,
      body: { message: 'Validation failed', errors: { email: ['Email already taken.'] } },
    }).as('createFail');

    cy.visitAuthenticated('/dashboard/athletes/new');
    cy.wait('@academy');

    cy.get('input[id="first_name"]').type('Mario');
    cy.get('input[id="last_name"]').type('Rossi');
    cy.get('input[id="email"]').type('duplicate@example.com');
    cy.contains('button', 'Create athlete').click();

    cy.wait('@createFail');
    // Same scroll dance as above — the top-of-page error banner sits
    // outside the post-click scroll position on the default viewport.
    cy.get('.p-message')
      .scrollIntoView()
      .should('be.visible')
      .and('contain.text', 'Email already taken');
  });

  it('cancel returns to the athletes list without submitting', () => {
    cy.visitAuthenticated('/dashboard/athletes/new');
    cy.wait('@academy');

    cy.contains('button', 'Cancel').click();
    cy.url().should('match', /\/dashboard\/athletes$/);
  });
});

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------

describe('Athlete edit form', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_MARIO },
    }).as('getAthlete');
  });

  it('loads the athlete and pre-fills the form', () => {
    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@academy');
    cy.wait('@getAthlete');

    cy.get('h1').should('contain', 'Edit athlete');
    cy.get('input[id="first_name"]').should('have.value', 'Mario');
    cy.get('input[id="last_name"]').should('have.value', 'Rossi');
    cy.get('input[id="email"]').should('have.value', 'mario@example.com');
    cy.contains('button', 'Save changes').scrollIntoView().should('be.visible');
  });

  it('PUTs the updated payload and returns to the athlete detail', () => {
    cy.intercept('PUT', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: { ...ATHLETE_MARIO, first_name: 'Marco' } },
    }).as('updateAthlete');
    // Detail re-fetches the athlete + its documents list when we
    // land back on it after submit (#281).
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    });

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait('@academy');
    cy.wait('@getAthlete');

    cy.get('input[id="first_name"]').clear().type('Marco');
    cy.contains('button', 'Save changes').click();

    cy.wait('@updateAthlete')
      .its('request.body')
      .should('deep.include', { first_name: 'Marco', last_name: 'Rossi' });

    // After #281, edit submit returns to the parent detail (default
    // child route Documents) — keeps the user in the same page they
    // were editing instead of bouncing to the list.
    cy.url().should('match', /\/dashboard\/athletes\/42\/documents$/);
  });
});
