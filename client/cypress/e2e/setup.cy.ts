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
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
  });

  it('renders the setup form', () => {
    cy.get('h1').should('contain', 'Set up your academy');
    cy.get('input[id="name"]').should('exist');
    // #72: setup intentionally does not collect a structured address —
    // six required fields on first contact would be a wall of friction.
    // Address belongs to the edit flow.
    cy.get('textarea[id="address"]').should('not.exist');
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
      body: {
        data: { id: 1, name: 'My Academy', slug: 'my-academy', address: null, logo_url: null },
      },
    }).as('createAcademy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletesList');

    cy.get('input[id="name"]').type('My Academy');
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy');
    cy.wait('@athletesList');
    cy.url().should('include', '/dashboard/athletes');
  });

  // #72: setup is now name-only (plus optional training days). The address
  // path is exercised by the edit form's spec.

  it('with "Yes, enroll me" → POST /me/athlete fires after create, before redirect (#751)', () => {
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: {
        data: { id: 1, name: 'My Academy', slug: 'my-academy', address: null, logo_url: null },
      },
    }).as('createAcademy');
    cy.intercept('POST', '/api/v1/me/athlete', {
      statusCode: 201,
      body: { data: { id: 42, is_self: true } },
    }).as('enrollMe');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletesList');

    cy.get('input[id="name"]').type('My Academy');
    cy.get('[data-cy="setup-train-here-yes"]').click();
    cy.get('button[type="submit"]').click();

    cy.wait('@createAcademy');
    cy.wait('@enrollMe');
    cy.wait('@athletesList');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('default "Not now" → POST /me/athlete is NOT fired (#751)', () => {
    cy.intercept('POST', '/api/v1/academy', {
      statusCode: 201,
      body: {
        data: { id: 1, name: 'My Academy', slug: 'my-academy', address: null, logo_url: null },
      },
    }).as('createAcademy');
    // If /me/athlete fires unexpectedly, Cypress will error on the un-stubbed
    // request — the absence of the .wait() is the assertion.
    cy.intercept('POST', '/api/v1/me/athlete', () => {
      throw new Error('should not be called when Not now is selected');
    });
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);

    cy.get('input[id="name"]').type('My Academy');
    cy.get('button[type="submit"]').click();
    cy.wait('@createAcademy');
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
