import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const EMPTY_PAGE = {
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
};

describe('athletes table — column sorting', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance/summary*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', { statusCode: 200, body: EMPTY_PAGE }).as('athletes');
  });

  it('sends sort_by + sort_order on the wire when a sortable header is clicked', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // PrimeNG p-table sorts ascending on the first header click and toggles
    // to descending on a second click — same as every other Material/AG-Grid
    // table the user has muscle memory for (Jakob's law).
    cy.get('[data-cy="athletes-th-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-th-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');
  });

  it('sends sort_by=last_name when the Name header is clicked', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes').its('request.url').should('include', 'sort_by=last_name');
  });
});
