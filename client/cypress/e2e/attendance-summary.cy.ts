import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_IPHONE_SE } from '../support/viewports';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const SUMMARY_THREE = {
  statusCode: 200,
  body: {
    data: [
      { athlete_id: 1, first_name: 'Mario', last_name: 'Rossi', count: 8 },
      { athlete_id: 2, first_name: 'Luigi', last_name: 'Verdi', count: 3 },
      { athlete_id: 3, first_name: 'Marco', last_name: 'Bianchi', count: 12 },
    ],
  },
};

describe('monthly attendance summary', () => {
  beforeEach(() => {
    // Catch-all FIRST so no unmocked background GET (e.g. the notification
    // bell's /me/notifications poll, #729) reaches the dev backend, 401s on
    // the fake token, and trips the auth-interceptor redirect to /auth/login
    // before the dashboard widget renders. Specific stubs are registered
    // after, so they win (Cypress resolves most-recently-defined).
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    // The athletes-list page also mounts <app-onboarding-checklist> (#424),
    // which reads `data.completed_steps` / `data.available_steps`. The
    // catch-all's bare `{ data: [] }` (an array) makes those undefined, the
    // checklist throws during change detection, and the throw poisons every
    // subsequent CD tick — so when the summary widget's response sets
    // loading=false the re-render throws again and the widget stays frozen on
    // its skeleton. Stub the dismissed object so the checklist self-hides.
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
      },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    // Composite envelope (#881): the sibling expiring-documents widget reads
    // `missing_medical_certificate` and calls `.length` on it. A bare
    // `{ data: [] }` leaves it undefined, the widget throws during change
    // detection, and — because it sits above the summary widget in the tree —
    // that throw aborts the CD tick that would clear the summary's skeleton.
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [], missing_medical_certificate: [] },
    });
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
  });

  it('reaches the month summary from the attendance page (#1455)', () => {
    // The widget on the roster was this page's only way in, and it went with
    // the Sessions column that replaced it. The link lives on the attendance
    // screen now — where someone thinking about attendance already is.
    cy.visitAuthenticated('/dashboard/attendance');

    cy.intercept('GET', '/api/v1/attendance/summary*', SUMMARY_THREE).as('summary');

    cy.get('[data-cy="attendance-summary-link"]').click();
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-page"]').should('exist');
    cy.get('[data-cy="monthly-summary-table"]').should('exist');
  });

  it('filters the table by athlete name on the full page', () => {
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/attendance/summary');
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-filter"]').type('mar');
    cy.get('[data-cy="monthly-summary-table-row-3"]').should('exist'); // Marco
    cy.get('[data-cy="monthly-summary-table-row-1"]').should('exist'); // Mario
    cy.get('[data-cy="monthly-summary-table-row-2"]').should('not.exist'); // Luigi
  });

  it('orders the table from its headers, the roster’s way (#1526)', () => {
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/attendance/summary');
    cy.wait('@summary');

    const ids = (): Cypress.Chainable<string[]> =>
      cy
        .get('[data-cy="monthly-summary-table"] tbody tr')
        .then(($rows) => Cypress.$.map($rows, (row) => row.getAttribute('data-cy') ?? ''));

    // Opens on most-first, which is what the page is opened to see.
    ids().should('deep.equal', [
      'monthly-summary-table-row-3',
      'monthly-summary-table-row-1',
      'monthly-summary-table-row-2',
    ]);

    // Fewest first — who has stopped coming. The question the table could not
    // answer before, on the page that exists to answer it.
    cy.get('[data-cy="monthly-summary-th-days"]').click();
    ids().should('deep.equal', [
      'monthly-summary-table-row-2',
      'monthly-summary-table-row-1',
      'monthly-summary-table-row-3',
    ]);

    // And the athlete column carries the roster's own 4-state cycle: first
    // name ascending on the first press, with the signifier to say so.
    cy.get('[data-cy="monthly-summary-th-athlete"]').click();
    ids().should('deep.equal', [
      'monthly-summary-table-row-2', // Luigi
      'monthly-summary-table-row-3', // Marco
      'monthly-summary-table-row-1', // Mario
    ]);
    cy.get('[data-cy="monthly-summary-th-athlete"] .sort-header__signifier').should(
      'have.text',
      'F↑',
    );
    // ...and the days header lets go of its arrow when it stops driving.
    cy.get('[data-cy="monthly-summary-th-days"] .sort-header__signifier').should('have.text', '↕');
  });

  it('the days sort reaches a phone, where the table does not exist (#1526)', () => {
    // Below 768px `.summary-page__table-wrapper` is `display: none` and the
    // card list renders instead, so a sort living only in a `<th>` would be
    // desktop-only — the mistake #1443 fixed for belt on the roster. "Who has
    // stopped coming" is what this page is for; it cannot be desktop-only.
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    cy.intercept('GET', `/api/v1/attendance/summary?month=${currentMonthStr()}`, SUMMARY_THREE).as(
      'summary',
    );

    cy.visitAuthenticated('/dashboard/attendance/summary');
    cy.wait('@summary');

    cy.get('[data-cy="monthly-summary-table"]').should('not.be.visible');
    cy.get('[data-cy="monthly-summary-th-days"]').should('not.be.visible');

    const mobileIds = (): Cypress.Chainable<string[]> =>
      cy
        .get('[data-cy="monthly-summary-mobile-list"] li')
        .then(($rows) => Cypress.$.map($rows, (row) => row.getAttribute('data-cy') ?? ''));

    mobileIds().should('deep.equal', [
      'monthly-summary-mobile-row-3',
      'monthly-summary-mobile-row-1',
      'monthly-summary-mobile-row-2',
    ]);

    cy.get('[data-cy="monthly-summary-sort-days"]').should('be.visible').click();

    mobileIds().should('deep.equal', [
      'monthly-summary-mobile-row-2',
      'monthly-summary-mobile-row-1',
      'monthly-summary-mobile-row-3',
    ]);
  });
});
