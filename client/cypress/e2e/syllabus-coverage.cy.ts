import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Syllabus coverage (#1565).
 *
 * Every call is intercepted, so what this proves is the client wiring: that
 * the headline and the three-way tally render, that the filter and the season
 * stepper re-ask the server with the right query, and that an academy with no
 * programme is told what to do rather than shown a 0%.
 */

const ACADEMY = { ...MOCK_ACADEMY, season_label: '2026/27' };

/**
 * Landing on `/dashboard/stats` opens the overview tab, which reads the
 * paginated athletes endpoint — a bare `{ data: [] }` has no `meta` and the
 * page throws on `meta.last_page` before this spec gets anywhere.
 */
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

function position(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Closed guard',
    kind: 'both',
    in_scope: 6,
    covered: 3,
    thin: 1,
    missing: 2,
    worked: 0,
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    totals: { in_scope: 10, covered: 4, thin: 2, missing: 4, percentage: 40 },
    positions: [
      position(),
      position({
        id: 2,
        name: 'Half guard',
        in_scope: 4,
        covered: 1,
        thin: 1,
        missing: 2,
        worked: 2,
      }),
    ],
    missing: [
      { id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'both' },
      { id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
    ],
    taught: [
      {
        id: 11,
        name: 'Armbar',
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 3,
        last_taught_on: '2026-10-05',
        state: 'covered',
      },
    ],
    timeline: [
      { on: '2026-09-06', covered: 0 },
      { on: '2026-09-13', covered: 2 },
      { on: '2026-09-20', covered: 4 },
    ],
    ...over,
  };
}

function stub(data: Record<string, unknown> = report()): void {
  cy.clearLocalStorage();
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
  cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', { statusCode: 200, body: { data } }).as(
    'coverage',
  );
}

describe('Syllabus coverage', () => {
  it('leads with the percentage, the fraction and the three-way split', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage').its('request.url').should('contain', 'seasons_back=0');

    cy.get('[data-cy="syllabus-coverage-percentage"]').should('contain.text', '40');
    cy.get('[data-cy="syllabus-coverage"]').should('contain.text', '4 of 10 covered this season');

    cy.get('[data-cy="syllabus-coverage-totals"]')
      .should('contain.text', '4 covered')
      .and('contain.text', '2 taught once')
      .and('contain.text', '4 not taught');

    // The position axis is the primary view: it is what exposes real gaps.
    cy.get('[data-cy="syllabus-position-1"]').should('contain.text', 'Closed guard');
    cy.get('[data-cy="syllabus-position-2"]').should('contain.text', 'worked 2×');

    cy.get('[data-cy="syllabus-coverage-missing"]').should('contain.text', 'Omoplata');
    cy.get('[data-cy="syllabus-coverage-taught"]').should('contain.text', 'Armbar');
  });

  it('re-asks the server when the gi filter moves — the denominator moves with it', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: report({
          kind: 'nogi',
          totals: { in_scope: 3, covered: 1, thin: 0, missing: 2, percentage: 33 },
        }),
      },
    }).as('filtered');

    cy.get('[data-cy="syllabus-coverage-kind"]').contains('No-gi').click();

    cy.wait('@filtered').its('request.url').should('contain', 'kind=nogi');
    cy.get('[data-cy="syllabus-coverage"]').should('contain.text', '1 of 3 covered this season');
  });

  it('walks back a season, and offers nothing past the current one', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-coverage-next"]').should('be.disabled');

    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: report({ season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' } }),
      },
    }).as('previous');

    cy.get('[data-cy="syllabus-coverage-prev"]').click();

    cy.wait('@previous').its('request.url').should('contain', 'seasons_back=1');
    cy.get('[data-cy="syllabus-coverage-season"]').should('contain.text', '2025/26');
    cy.get('[data-cy="syllabus-coverage-next"]').should('not.be.disabled');
  });

  it('tells an academy with no programme what to do, rather than showing it a 0%', () => {
    stub(
      report({
        totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
        positions: [],
        missing: [],
        taught: [],
      }),
    );

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-coverage-no-programme"]').should('be.visible');
    cy.get('[data-cy="syllabus-coverage-positions"]').should('not.exist');

    cy.get('[data-cy="syllabus-coverage-programme-link"]').click();
    cy.location('pathname').should('eq', '/dashboard/academy/syllabus');
  });

  it('reaches the report from the stats tabs', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-syllabus"]', { timeout: 15000 }).click();

    cy.location('pathname').should('eq', '/dashboard/stats/syllabus');
    cy.get('[data-cy="syllabus-coverage"]').should('exist');
  });
});
