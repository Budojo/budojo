export {};

const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Academy setup page', () => {
  beforeEach(() => {
    // Authenticated user, no academy yet — noAcademyGuard allows access
    cy.intercept('GET', '/api/v1/academy', { statusCode: 404, body: {} }).as('academy');
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
  });

  it('renders the setup form', () => {
    cy.get('h1').should('contain', 'Set up your academy');
    cy.get('input[id="name"]').should('exist');
    cy.get('textarea[id="address"]').should('exist');
    cy.get('button[type="submit"]').should('contain.text', 'Create academy');
  });

  it('shows validation error when submitting empty name', () => {
    cy.get('button[type="submit"]').click();
    cy.contains('Academy name is required').should('be.visible');
  });

  it('shows validation error for whitespace-only name', () => {
    cy.get('input[id="name"]').type('   ');
    cy.get('button[type="submit"]').click();
    cy.contains('Academy name is required').should('be.visible');
  });

  it('successful setup redirects to /dashboard/athletes', () => {
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: { data: { id: 1, name: 'My Academy', slug: 'my-academy', address: null } },
    }).as('createAcademy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);

    cy.get('input[id="name"]').type('My Academy');
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('can optionally fill in address', () => {
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: {
        data: {
          id: 1,
          name: 'My Academy',
          slug: 'my-academy',
          address: 'Via Roma 1, Milano',
        },
      },
    }).as('createAcademy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);

    cy.get('input[id="name"]').type('My Academy');
    cy.get('textarea[id="address"]').type('Via Roma 1, Milano');
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy').its('request.body').should('deep.include', {
      name: 'My Academy',
      address: 'Via Roma 1, Milano',
    });
    cy.url().should('include', '/dashboard/athletes');
  });

  it('shows error message when creation fails', () => {
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 500,
      body: { message: 'Server error.' },
    }).as('createFail');

    cy.get('input[id="name"]').type('My Academy');
    cy.get('button[type="submit"]').click();

    cy.wait('@createFail');
    cy.get('.p-message').should('be.visible');
  });
});
