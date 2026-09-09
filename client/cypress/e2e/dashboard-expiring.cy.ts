import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
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
    // Catch-all FIRST so no unmocked background GET reaches the dev
    // backend, 401s on the fake token, and trips the auth redirect.
    // Specific stubs registered after still win (most-recently-defined).
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    // The `/dashboard/athletes` page co-mounts <app-onboarding-checklist>
    // (#424) ABOVE <app-expiring-documents-widget> in the template. The
    // checklist reads `data.completed_steps` / `data.available_steps`; the
    // catch-all's bare `{ data: [] }` leaves those undefined, the checklist
    // throws during change detection, and that throw aborts the CD tick
    // that would paint the expiring widget below it — so the count never
    // renders. Stub the dismissed object so the checklist self-hides.
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
      },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
  });

  it('counts the alerts on the roster and opens the full list from the panel (#1456)', () => {
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
        missing_medical_certificate: [],
      },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes', '@getExpiring']);

    // The widget this used to assert became a button in the filter row
    // (#1456) — the count is on the control, the breakdown is in the panel,
    // and the panel is what leads to the full list.
    cy.get('[data-cy="athletes-alerts"]')
      .should('contain.text', '3')
      // Amber, not the muted grey of the eye and the bin beside it — the one
      // thing a warning must not look like is every other control (#1482).
      .and('have.class', 'athletes-page__toggle--alert')
      .click();
    cy.get('[data-cy="athletes-alerts-expiring"]').should('be.visible').click();

    cy.url().should('include', '/dashboard/documents/expiring');
    cy.wait('@getExpiring');

    cy.get('[data-cy="expiring-table"] tbody tr').should('have.length', 3);
    cy.get('[data-cy="athlete-link"]').first().should('contain.text', 'Mario Rossi');
  });

  it('goes quiet rather than vanishing when nothing needs attention (#1482)', () => {
    // It used to disappear entirely, which made the toolbar's controls shift
    // sideways the moment the last certificate was filed — and left nowhere
    // to look to confirm that nothing IS wrong. It stays, grey and without a
    // count, and says so when opened.
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [], missing_medical_certificate: [] },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes', '@getExpiring']);

    cy.get('[data-cy="athletes-alerts"]')
      .should('be.visible')
      .and('not.have.class', 'athletes-page__toggle--alert');
    cy.get('[data-cy="athletes-alerts"] .athletes-page__toggle-count').should('not.exist');

    cy.get('[data-cy="athletes-alerts"]').click();
    cy.get('[data-cy="athletes-alerts-empty"]').should('be.visible');
  });

  it('the list page shows the empty-state block when no documents are expiring', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getExpiring');

    cy.visitAuthenticated('/dashboard/documents/expiring');
    cy.wait(['@academy', '@getExpiring']);

    // Single combined empty block now covers BOTH axes (no expiring
    // docs AND no missing certs). The dual desktop/mobile blocks of
    // the pre-#891 layout collapsed into one `[data-cy="all-clear-empty"]`
    // at the section level so the user gets one signal, not two.
    cy.get('[data-cy="all-clear-empty"]').should('be.visible');
    cy.get('[data-cy="all-clear-empty"]').contains('All documents up to date').should('be.visible');
  });

  it('surfaces athletes without medical certificate and deep-links to their documents tab (#891)', () => {
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: {
        data: [],
        missing_medical_certificate: [
          { id: 11, first_name: 'Giulia', last_name: 'Rossi' },
          { id: 12, first_name: 'Luca', last_name: 'Verdi' },
        ],
      },
    }).as('getExpiring');
    cy.intercept('GET', '/api/v1/athletes/11', {
      statusCode: 200,
      body: {
        data: {
          id: 11,
          first_name: 'Giulia',
          last_name: 'Rossi',
          email: null,
          phone_country_code: null,
          phone_national_number: null,
          address: null,
          date_of_birth: null,
          belt: 'white',
          stripes: 0,
          status: 'active',
          joined_at: '2024-01-01',
          created_at: '2024-01-01T00:00:00+00:00',
        },
      },
    }).as('getAthlete');
    cy.intercept('GET', '/api/v1/athletes/11/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/documents/expiring');
    cy.wait(['@academy', '@getExpiring']);

    cy.get('[data-cy="missing-cert-section"]').should('be.visible');
    cy.get('[data-cy="missing-cert-row-11"]').should('contain.text', 'Giulia Rossi');
    cy.get('[data-cy="missing-cert-row-12"]').should('contain.text', 'Luca Verdi');

    cy.get('[data-cy="missing-cert-row-11"]').click();
    cy.url().should('include', '/dashboard/athletes/11/documents');
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
          phone_country_code: null,
          phone_national_number: null,
          address: null,
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

// ── Mobile-viewport smoke (audit row 9, #681) ─────────────────────────
//
// Below 768px the desktop table is `display: none` and a card list
// renders instead — these specs cover the empty / populated branches
// of the mobile path and the in-card affordances (athlete-link
// navigation, download button presence).
MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Expiring documents — mobile smoke (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    });

    it('shows the empty mobile state when there are no expiring documents', () => {
      cy.intercept('GET', '/api/v1/documents/expiring*', {
        statusCode: 200,
        body: { data: [] },
      }).as('getExpiring');

      cy.visitAuthenticated('/dashboard/documents/expiring');
      cy.wait(['@academy', '@getExpiring']);

      // Same `all-clear-empty` block as the desktop branch — see the
      // #891 collapse note on the desktop spec above.
      cy.get('[data-cy="all-clear-empty"]').should('be.visible');
      cy.get('[data-cy^="expiring-card-"]').should('not.exist');
    });

    it('renders one card per expiring document with athlete link + download affordance', () => {
      cy.intercept('GET', '/api/v1/documents/expiring*', {
        statusCode: 200,
        body: {
          data: [
            expiringDoc({ id: 1, original_name: 'med-2026.pdf' }),
            expiringDoc({
              id: 2,
              athlete_id: 43,
              athlete: { id: 43, first_name: 'Luigi', last_name: 'Verdi' },
              original_name: 'id-card.pdf',
              type: 'id_card',
              expires_at: '2026-07-15',
            }),
          ],
        },
      }).as('getExpiring');

      cy.visitAuthenticated('/dashboard/documents/expiring');
      cy.wait(['@academy', '@getExpiring']);

      // Two cards present, athlete names visible.
      cy.get('[data-cy="expiring-card-1"]').should('be.visible').and('contain.text', 'Mario');
      cy.get('[data-cy="expiring-card-2"]').should('be.visible').and('contain.text', 'Luigi');

      // Download affordance present on each card.
      cy.get('[data-cy="expiring-card-download-1"]').should('exist');
      cy.get('[data-cy="expiring-card-download-2"]').should('exist');

      // Tapping the athlete name in a card routes to that athlete's
      // documents tab (same target as the desktop link).
      cy.intercept('GET', '/api/v1/athletes/42', {
        statusCode: 200,
        body: {
          data: {
            id: 42,
            first_name: 'Mario',
            last_name: 'Rossi',
            email: null,
            phone_country_code: null,
            phone_national_number: null,
            address: null,
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

      cy.get('[data-cy="expiring-card-athlete-1"]').click();
      cy.url().should('include', '/dashboard/athletes/42/documents');
    });
  });
});
