export {};

const ACADEMY_TORINO = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: {
    line1: 'Via Roma 1',
    line2: null,
    city: 'Torino',
    postal_code: '10100',
    province: 'TO',
    country: 'IT',
  },
  logo_url: null,
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

  it('renders name, slug, and structured address from the cached signal (#72)', () => {
    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-name"]').should('contain', 'Gracie Barra Torino');
    cy.get('[data-cy="academy-row-slug"]').should('contain', 'gracie-barra-torino-a1b2c3d4');
    // Angular's conditional rendering inserts indentation between the
    // `{{ postal_code }}` / `{{ city }}` / `({{ province }})` interpolations,
    // so the raw textContent has multiple spaces between them. Normalise
    // before substring-matching — the Vitest sibling spec uses the same
    // shape.
    cy.get('[data-cy="academy-row-address"]')
      .invoke('text')
      .then((t) => {
        const normalized = t.replace(/\s+/g, ' ');
        expect(normalized).to.contain('Via Roma 1');
        expect(normalized).to.contain('10100 Torino (TO)');
      });
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

  it('pre-populates the form with the current academy values (#72)', () => {
    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    cy.get('[data-cy="academy-form-name"]').should('have.value', 'Gracie Barra Torino');
    cy.get('[data-cy="academy-form-address-line1"]').should('have.value', 'Via Roma 1');
    cy.get('[data-cy="academy-form-address-city"]').should('have.value', 'Torino');
    cy.get('[data-cy="academy-form-address-postal-code"]').should('have.value', '10100');
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

  it('blocks submit and shows the all-or-nothing error when address fields are partially cleared (#72)', () => {
    // The Vitest sibling spec exercises the buildPayload path that sends
    // `address: null` on the wire when every required field is empty —
    // covering it here too would require driving the province <p-select>
    // through its dropdown UI, which is brittle. The valuable E2E signal
    // is that the cross-field validator surfaces the right inline error.
    cy.intercept('PATCH', '/api/v1/academy', cy.spy().as('patchSpy'));

    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    // Wipe two of four required fields — pair is now half-filled.
    cy.get('[data-cy="academy-form-address-line1"]').clear();
    cy.get('[data-cy="academy-form-address-city"]').clear();
    cy.get('[data-cy="academy-form-save"]').click();

    cy.get('[data-cy="academy-form-address-error"]').should('be.visible');
    cy.get('@patchSpy').should('not.have.been.called');
    cy.url().should('include', '/dashboard/academy/edit');
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
