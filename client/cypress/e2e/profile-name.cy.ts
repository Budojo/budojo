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
  name: 'Mario Rossi',
  email: 'mario@example.com',
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
};

const USER_RENAMED = {
  ...USER,
  name: 'Mario R.',
};

describe('profile — inline name edit (#463)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: USER } }).as('me');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders the read-only name and a pencil affordance', () => {
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario Rossi');
    cy.get('[data-cy="profile-name-edit"]').should('exist');
    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
  });

  it('opens the inline edit, sends PATCH /me, swaps the cached name, and toasts', () => {
    cy.intercept('PATCH', '/api/v1/me', (req) => {
      expect(req.body).to.deep.equal({ name: 'Mario R.' });
      req.reply({ statusCode: 200, body: { data: USER_RENAMED } });
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-name-edit"]').click();
    cy.get('[data-cy="profile-name-input"]')
      .should('have.value', 'Mario Rossi')
      .clear()
      .type('Mario R.');
    cy.get('[data-cy="profile-name-save"]').click();

    cy.wait('@updateProfile');
    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario R.');
    cy.contains('Name updated').should('be.visible');
  });

  it('surfaces an inline server error on a 422 with errors.name', () => {
    cy.intercept('PATCH', '/api/v1/me', {
      statusCode: 422,
      body: {
        message: 'The given data was invalid.',
        errors: { name: ['The name must be between 2 and 255 characters.'] },
      },
    }).as('updateProfile');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-name-edit"]').click();
    cy.get('[data-cy="profile-name-input"]').clear().type('Whatever');
    cy.get('[data-cy="profile-name-save"]').click();

    cy.wait('@updateProfile');
    // Profile sits inside `.main { overflow-y: auto }` (the dashboard
    // shell scroll container). Without scrollIntoView, Cypress flags the
    // server-error <small> as clipped by the overflow:auto parent —
    // gotcha § Cypress / overflow:auto.
    cy.get('[data-cy="profile-name-server-invalid"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="profile-name-edit-form"]').should('exist');
  });

  it('cancel restores the previous value without a network call', () => {
    cy.intercept('PATCH', '/api/v1/me', cy.spy().as('updateProfile'));

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-name-edit"]').click();
    cy.get('[data-cy="profile-name-input"]').clear().type('Throwaway');
    cy.get('[data-cy="profile-name-cancel"]').click();

    cy.get('[data-cy="profile-name-edit-form"]').should('not.exist');
    cy.get('[data-cy="profile-name"]').should('contain.text', 'Mario Rossi');
    cy.get('@updateProfile').should('not.have.been.called');
  });
});
