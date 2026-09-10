import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Two rules the design canon states outright, and the app broke (#1501, #1502).
 *
 * Both were found by the full-page design inventory (#1506) — neither is
 * visible from a diff, because each is a global rule meeting a local one.
 */
const ATHLETES = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Isabella',
        last_name: 'Conciarelli',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1995-03-12',
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2024-09-01',
        created_at: '2024-09-01T10:00:00+00:00',
        attendance_month_count: 6,
        attendance_total_count: 41,
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
  },
};

function seed() {
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES);
  cy.intercept('GET', '/api/v1/documents/expiring*', {
    statusCode: 200,
    body: { data: [], missing_medical_certificate: [] },
  });
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
}

describe('sentence case, in every table (#1501)', () => {
  it('spells a column header the same way whether the table is PrimeNG or not', () => {
    // The daily check-in is a `p-table` and the roster is a hand-rolled
    // `<table>`, and the theme uppercased only the first — so the same column
    // read "FULL NAME" on one page and "Full name" one click away.
    seed();
    cy.visitAuthenticated('/dashboard/attendance');

    cy.get('.p-datatable-thead th')
      .first()
      .should(($th) => {
        const text = $th.text().trim();
        expect(text, 'the header as rendered').to.not.equal(text.toUpperCase());
      })
      .and('have.css', 'text-transform', 'none');
  });
});

describe('one primary CTA per view (#1502)', () => {
  it('does not let uploading a logo shout as loudly as editing the academy', () => {
    seed();
    cy.visitAuthenticated('/dashboard/academy');

    // The page's action is Edit. The upload is a card action beside it.
    cy.get('[data-cy="academy-logo-upload"] button').should('have.class', 'p-button-secondary');
    cy.get('[data-cy="academy-edit-link"] button').should('not.have.class', 'p-button-secondary');
  });
});
