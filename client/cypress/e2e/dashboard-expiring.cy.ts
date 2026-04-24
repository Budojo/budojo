export {};

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: { id: 1, name: 'Test Academy', slug: 'test-academy', address: null } },
};

const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

function expiringDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    issued_at: '2025-01-01',
    expires_at: '2026-05-10',
    notes: null,
    created_at: '2026-04-20T10:00:00+00:00',
    deleted_at: null,
    athlete: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
    ...overrides,
  };
}

describe('Expiring documents widget + deep-link', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
  });

  it('shows the count on /dashboard/athletes and navigates to the full list on click', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: {
        data: [
          expiringDoc({
            id: 1,
            athlete: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
          }),
          expiringDoc({
            id: 2,
            athlete_id: 7,
            type: 'id_card',
            athlete: { id: 7, first_name: 'Anna', last_name: 'Bianchi' },
          }),
          expiringDoc({
            id: 3,
            athlete_id: 99,
            type: 'insurance',
            athlete: { id: 99, first_name: 'Luca', last_name: 'Verdi' },
          }),
        ],
      },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes', '@getExpiring']);

    cy.get('[data-cy="expiring-widget-count"]').should(
      'contain.text',
      '3 documents need attention',
    );

    cy.get('[data-cy="expiring-widget"]').click();

    cy.url().should('include', '/dashboard/documents/expiring');
    cy.wait('@getExpiring');

    cy.get('[data-cy="expiring-table"] tbody tr').should('have.length', 3);
    cy.get('[data-cy="athlete-link"]').first().should('contain.text', 'Mario Rossi');
  });

  it('renders the "up to date" state on the widget when the list is empty', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes', '@getExpiring']);

    cy.get('[data-cy="expiring-widget"]').should('contain.text', 'All documents up to date');
    cy.get('[data-cy="expiring-widget-count"]').should('not.exist');
  });

  it('the list page shows the empty-state block when no documents are expiring', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/documents/expiring');
    cy.wait(['@academy', '@getExpiring']);

    cy.get('[data-cy="expiring-list-empty"]').should('be.visible');
    cy.contains('All documents up to date').should('be.visible');
  });

  it('athlete name link on the list page deep-links to the athlete documents page', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: {
        data: [
          expiringDoc({
            id: 1,
            athlete: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
          }),
        ],
      },
    }).as('getExpiring');
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: {
        data: {
          id: 42,
          first_name: 'Mario',
          last_name: 'Rossi',
          email: null,
          phone: null,
          date_of_birth: null,
          belt: 'blue',
          stripes: 2,
          status: 'active',
          joined_at: '2024-01-01',
          created_at: '2024-01-01T00:00:00+00:00',
        },
      },
    }).as('getAthlete');
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/documents/expiring');
    cy.wait(['@academy', '@getExpiring']);

    cy.get('[data-cy="athlete-link"]').first().click();
    cy.url().should('include', '/dashboard/athletes/42/documents');
  });
});
