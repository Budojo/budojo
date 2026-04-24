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
    // Intercept the first GET /api/v1/academy (noAcademyGuard) exactly once — return 404
    // so the guard allows access to /setup. Tests that trigger a redirect to /dashboard
    // must set up their own intercept for the subsequent hasAcademyGuard call.
    cy.intercept(
      { method: 'GET', url: '/api/v1/academy', times: 1 },
      { statusCode: 404, body: {} },
    ).as('academy');
    // Post-create-academy redirect lands on /dashboard/athletes where the
    // M3.4 expiring-documents widget fires on mount, plus the athletes list
    // itself is fetched. Stub both defensively so they never reach the Vite
    // dev-server proxy (no `api` host in CI) — otherwise the CI log fills
    // with `getaddrinfo EAI_AGAIN api` noise that can mask real failures.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', {
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
    });
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
    // Note: `hasAcademyGuard` no longer fires a GET /api/v1/academy after a
    // successful POST — `AcademyService.create()` sets the cached signal via
    // `tap()`, and the guard short-circuits off that cache (see #40).
    // We assert the user-visible outcome: create, redirect, land on the list.
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: { data: { id: 1, name: 'My Academy', slug: 'my-academy', address: null } },
    }).as('createAcademy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletesList');

    cy.get('input[id="name"]').type('My Academy');
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy');
    cy.wait('@athletesList');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('can optionally fill in address', () => {
    // Post-#40: `hasAcademyGuard` reads the cached signal populated by `create()`,
    // so no follow-up GET /api/v1/academy fires after the redirect.
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: {
        data: { id: 1, name: 'My Academy', slug: 'my-academy', address: 'Via Roma 1, Milano' },
      },
    }).as('createAcademy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletesList');

    cy.get('input[id="name"]').type('My Academy');
    cy.get('textarea[id="address"]').type('Via Roma 1, Milano');
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy').its('request.body').should('deep.include', {
      name: 'My Academy',
      address: 'Via Roma 1, Milano',
    });
    cy.wait('@athletesList');
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
