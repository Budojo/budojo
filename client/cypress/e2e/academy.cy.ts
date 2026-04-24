export {};

const ACADEMY_TORINO = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: 'Via Roma 1, Torino',
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

// ---------------------------------------------------------------------------
// Academy detail (home)
// ---------------------------------------------------------------------------

describe('Academy home page', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY_TORINO } }).as(
      'academy',
    );
    // Defensive intercepts — `/dashboard` lands on `/dashboard/athletes` by
    // default on first load, which fires both widgets. Silence them so the
    // Vite proxy never falls through to a non-existent `api` host in CI.
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('reaches the academy home via the sidebar nav', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');

    cy.get('[data-cy="nav-academy"]').click();
    cy.url().should('include', '/dashboard/academy');
    cy.get('[data-cy="academy-detail"]').should('exist');
  });

  it('renders name, slug, and address from the cached signal', () => {
    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-name"]').should('contain', 'Gracie Barra Torino');
    cy.get('[data-cy="academy-row-slug"]').should('contain', 'gracie-barra-torino-a1b2c3d4');
    cy.get('[data-cy="academy-row-address"]').should('contain', 'Via Roma 1, Torino');
  });

  it('shows an em-dash when the academy has no address', () => {
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...ACADEMY_TORINO, address: null } },
    }).as('academyNoAddress');

    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academyNoAddress');

    // `have.text` does an exact match, but Angular preserves template
    // whitespace (newline + indent) around interpolated text, so the raw
    // textContent is ` — ` not `—`. Trim before comparing — the Vitest
    // sibling test takes the same shape.
    cy.get('[data-cy="academy-row-address"]')
      .invoke('text')
      .then((t) => expect(t.trim()).to.equal('—'));
  });

  it('navigates to the edit form via the Edit button', () => {
    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-edit-link"]').click();
    cy.url().should('include', '/dashboard/academy/edit');
    cy.get('[data-cy="academy-form"]').should('exist');
  });
});

// ---------------------------------------------------------------------------
// Academy edit form
// ---------------------------------------------------------------------------

describe('Academy edit form', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY_TORINO } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('pre-populates the form with the current academy values', () => {
    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').should('have.value', 'Gracie Barra Torino');
    cy.get('[data-cy="academy-form-address"]').should('have.value', 'Via Roma 1, Torino');
    cy.get('[data-cy="academy-form-slug"]').should('contain', 'gracie-barra-torino-a1b2c3d4');
  });

  it('saves a name change, shows a success toast, and redirects back to detail', () => {
    cy.intercept('PATCH', '/api/v1/academy', {
      statusCode: 200,
      body: {
        data: { ...ACADEMY_TORINO, name: 'Gracie Barra Torino Centro' },
      },
    }).as('updateAcademy');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').clear().type('Gracie Barra Torino Centro');
    cy.get('[data-cy="academy-form-save"]').click();

    cy.wait('@updateAcademy').its('request.body').should('deep.include', {
      name: 'Gracie Barra Torino Centro',
    });

    cy.url().should('match', /\/dashboard\/academy$/);
    cy.get('[data-cy="academy-name"]').should('contain', 'Gracie Barra Torino Centro');
    // Sidebar brand label is bound to the service signal; updating through
    // the service's tap() means it flips without a refetch.
    cy.contains('.sidebar__brand-name', 'Gracie Barra Torino Centro').should('exist');
  });

  it('sends address: null on the wire when the user clears the address textarea', () => {
    cy.intercept('PATCH', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...ACADEMY_TORINO, address: null } },
    }).as('updateAcademy');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-address"]').clear();
    cy.get('[data-cy="academy-form-save"]').click();

    cy.wait('@updateAcademy').its('request.body').should('deep.equal', {
      name: 'Gracie Barra Torino',
      address: null,
    });
    cy.url().should('match', /\/dashboard\/academy$/);
  });

  it('blocks submission and surfaces a required error when the name is empty', () => {
    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').clear();
    cy.get('[data-cy="academy-form-save"]').click();

    cy.get('[data-cy="academy-form-name-error"]').should('contain', 'Academy name is required');
    cy.url().should('include', '/dashboard/academy/edit');
  });

  it('shows a 422 validation message inline and stays on the form', () => {
    cy.intercept('PATCH', '/api/v1/academy', {
      statusCode: 422,
      body: {
        message: 'The given data was invalid.',
        errors: { name: ['Academy name must be unique.'] },
      },
    }).as('updateFailed');

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').clear().type('Duplicate Name');
    cy.get('[data-cy="academy-form-save"]').click();

    cy.wait('@updateFailed');
    cy.get('[data-cy="academy-form-error"]').should('contain', 'Academy name must be unique');
    cy.url().should('include', '/dashboard/academy/edit');
  });

  it('cancel returns to the detail page without saving', () => {
    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').clear().type('Discarded');
    cy.get('[data-cy="academy-form-cancel"]').click();

    cy.url().should('match', /\/dashboard\/academy$/);
    // Unchanged on detail — the cancel didn't PATCH anything.
    cy.get('[data-cy="academy-name"]').should('contain', 'Gracie Barra Torino');
  });
});
