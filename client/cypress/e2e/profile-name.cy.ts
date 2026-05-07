export {};

const ACADEMY = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: null,
  logo_url: null,
};

const USER = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: null,
  email: 'mario@example.com',
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
};

const USER_RENAMED = {
  ...USER,
  first_name: 'Mario',
  last_name: 'R.',
  full_name: 'Mario R.',
};

describe('profile — inline name edit (#463 + #479)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: USER } }).as('me');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders the read-only full name and a pencil affordance', () => {
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario Rossi');
    cy.get('[data-cy="profile-first-name-edit"]').should('exist');
    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
  });

  it('opens the inline edit, sends PATCH /me with first/last + handle, swaps the cached name, toasts', () => {
    cy.intercept('PATCH', '/api/v1/me', (req) => {
      expect(req.body).to.deep.equal({
        first_name: 'Mario',
        last_name: 'R.',
        handle: null,
      });
      req.reply({ statusCode: 200, body: { data: USER_RENAMED } });
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-first-name-edit"]').click();
    cy.get('[data-cy="profile-first-name-input"]').should('have.value', 'Mario');
    cy.get('[data-cy="profile-last-name-input"]').should('have.value', 'Rossi').clear().type('R.');
    cy.get('[data-cy="profile-name-save"]').click();

    cy.wait('@updateProfile');
    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario R.');
    cy.contains('Name updated').should('be.visible');
  });

  it('surfaces an inline server error on a 422 with errors.first_name', () => {
    cy.intercept('PATCH', '/api/v1/me', {
      statusCode: 422,
      body: {
        message: 'The given data was invalid.',
        errors: { first_name: ['The first name must be between 2 and 100 characters.'] },
      },
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-first-name-edit"]').click();
    cy.get('[data-cy="profile-first-name-input"]').clear().type('Whatever');
    cy.get('[data-cy="profile-name-save"]').click();

    cy.wait('@updateProfile');
    // Profile sits inside `.main { overflow-y: auto }` (the dashboard
    // shell scroll container). Without scrollIntoView, Cypress flags the
    // server-error <small> as clipped by the overflow:auto parent —
    // gotcha § Cypress / overflow:auto.
    cy.get('[data-cy="profile-name-server-invalid"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="profile-name-edit-form"]').should('exist');
  });

  it('cancel restores the previous values without a network call', () => {
    cy.intercept('PATCH', '/api/v1/me', cy.spy().as('updateProfile'));

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-first-name-edit"]').click();
    cy.get('[data-cy="profile-first-name-input"]').clear().type('Throwaway');
    cy.get('[data-cy="profile-name-cancel"]').click();

    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario Rossi');
    cy.get('@updateProfile').should('not.have.been.called');
  });
});

describe('profile — handle edit (#479)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: USER } }).as('me');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders "Not set" placeholder + pencil when handle is null', () => {
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-handle-empty"]').should('be.visible').and('contain.text', 'Not set');
    cy.get('[data-cy="profile-handle-edit"]').should('exist');
  });

  it('opens the inline edit, sends PATCH /me with the new handle, swaps the cached value', () => {
    const USER_WITH_HANDLE = { ...USER, handle: 'mario.rossi' };
    cy.intercept('PATCH', '/api/v1/me', (req) => {
      expect(req.body).to.deep.equal({
        first_name: 'Mario',
        last_name: 'Rossi',
        handle: 'mario.rossi',
      });
      req.reply({ statusCode: 200, body: { data: USER_WITH_HANDLE } });
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-handle-edit"]').click();
    cy.get('[data-cy="profile-handle-input"]').type('mario.rossi');
    cy.get('[data-cy="profile-handle-save"]').click();

    cy.wait('@updateProfile');
    cy.get('[data-cy="profile-handle-edit-form"]').should('not.exist');
    cy.get('[data-cy="profile-handle"]').should('contain.text', '@mario.rossi');
    cy.contains('Handle updated').should('be.visible');
  });

  it('surfaces an inline taken error on 422 with handle_taken', () => {
    cy.intercept('PATCH', '/api/v1/me', {
      statusCode: 422,
      body: {
        message: 'The given data was invalid.',
        errors: { handle: ['handle_taken'] },
      },
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-handle-edit"]').click();
    cy.get('[data-cy="profile-handle-input"]').type('matteo');
    cy.get('[data-cy="profile-handle-save"]').click();

    cy.wait('@updateProfile');
    cy.get('[data-cy="profile-handle-taken"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="profile-handle-edit-form"]').should('exist');
  });
});
