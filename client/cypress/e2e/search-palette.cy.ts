import { MOCK_ACADEMY, MOCK_ATHLETES_EMPTY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const SEARCH_RESULTS = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 42,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        phone_country_code: null,
        phone_national_number: null,
        website: null,
        facebook: null,
        instagram: null,
        date_of_birth: '1990-05-15',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        address: null,
        created_at: '2026-04-22T10:00:00+00:00',
        paid_current_month: false,
      },
      {
        id: 43,
        first_name: 'Marco',
        last_name: 'Rossini',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        website: null,
        facebook: null,
        instagram: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'suspended',
        joined_at: '2024-02-01',
        address: null,
        created_at: '2026-04-22T10:00:00+00:00',
        paid_current_month: false,
      },
    ],
  },
};

/**
 * Cmd/Ctrl-K command palette E2E (#426).
 *
 * Verifies the keyboard-open path that unit tests can't reach honestly
 * (the global window keydown listener + the PrimeNG dialog mount + the
 * routed navigation), at the SPA boundary.
 */
describe('Cmd/Ctrl-K command palette (#426)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance/summary*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', MOCK_ATHLETES_EMPTY).as('athletes');
    // Default the search endpoint to empty data; specific tests
    // override per-call when they want a richer response.
    cy.intercept('GET', '/api/v1/search*', { statusCode: 200, body: { data: [] } }).as('search');
  });

  it('opens on Ctrl+K and shows the empty-state hint before any input', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('[data-cy="search-palette-dialog"]').should('not.exist');
    cy.get('body').trigger('keydown', { key: 'k', ctrlKey: true });
    cy.get('[data-cy="search-palette-dialog"]').should('be.visible');
    cy.get('[data-cy="search-palette-empty"]').should('be.visible');
  });

  it('typing a query fires GET /api/v1/search?q= and renders matching rows', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // Override the default empty-search intercept so the assertion
    // below sees the rich payload. The wildcard pattern keeps this
    // robust to future query-string additions.
    cy.intercept('GET', '/api/v1/search*', SEARCH_RESULTS).as('searchMario');
    cy.get('body').trigger('keydown', { key: 'k', metaKey: true });

    cy.get('[data-cy="search-palette-input"]').type('mario');
    cy.wait('@searchMario').its('request.url').should('include', 'q=mario');

    cy.get('[data-cy="search-palette-row-42"]').should('contain', 'Mario Rossi');
    cy.get('[data-cy="search-palette-row-43"]').should('contain', 'Marco Rossini');
  });

  it('clicking a result navigates to the athlete detail and closes the palette', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.intercept('GET', '/api/v1/search*', SEARCH_RESULTS).as('searchMario');
    // Stub the athlete-detail load so the destination route resolves.
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: SEARCH_RESULTS.body.data[0] },
    });
    cy.intercept('GET', '/api/v1/athletes/42/documents*', { statusCode: 200, body: { data: [] } });

    cy.get('body').trigger('keydown', { key: 'k', metaKey: true });
    cy.get('[data-cy="search-palette-input"]').type('mario');
    cy.wait('@searchMario');

    cy.get('[data-cy="search-palette-row-42"]').click();

    // The dialog mask unmounts on close — assert on the mask, not the
    // host element (gotcha § Cypress / p-dialog).
    cy.get('.p-dialog-mask').should('not.exist');
    cy.url().should('include', '/dashboard/athletes/42');
  });
});
