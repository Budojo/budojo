import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_IPHONE_SE } from '../support/viewports';

/**
 * The check-in sorts the way the roster sorts (#1526).
 *
 * Both screens draw the same people out of the same paginated endpoint, and
 * until this issue they ordered them differently: the roster had the 4-state
 * name header (#196) and the belt button (#1443), the check-in had PrimeNG's
 * stock 2-state `pSortableColumn` on the name and no belt control at all —
 * `onSort()` allowlisted `belt`, but nothing on the page could emit it.
 *
 * These assertions are on the WIRE rather than on row order, because the
 * server does the ordering. A control that flips a signal and never reaches
 * `?sort_by=` sorts nothing.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const EMPTY_PAGE = {
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
};

describe('daily check-in — sorting', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance*', { statusCode: 200, body: { data: [] } }).as(
      'getDaily',
    );
    cy.intercept('GET', '/api/v1/athletes*', EMPTY_PAGE).as('athletes');
  });

  it('opens on belt descending, the order the roster opens on', () => {
    cy.visitAuthenticated('/dashboard/attendance');

    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');
  });

  it('flips the belt control between its two directions', () => {
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@athletes');

    cy.get('[data-cy="attendance-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=asc');

    // Back to descending, not to no sort: "off" would drop the reader into
    // insertion order, which is what this page used to open on.
    cy.get('[data-cy="attendance-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');
  });

  it('sorting the roster does not re-read the day', () => {
    // The date has not moved, so the attendance records on the wire are
    // unchanged — and a parallel re-fetch would race any in-flight optimistic
    // mark on the present-map. Sort changes go through `loadAthletes()` alone.
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait(['@athletes', '@getDaily']);

    let dayReads = 0;
    cy.intercept('GET', '/api/v1/attendance*', (req) => {
      dayReads += 1;
      req.reply({ statusCode: 200, body: { data: [] } });
    });

    cy.get('[data-cy="attendance-sort-belt"]').click();
    cy.wait('@athletes');
    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes').then(() => {
      expect(dayReads, 'attendance re-reads during a sort').to.eq(0);
    });
  });

  it('cycles the name header through the roster’s 4 states', () => {
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@athletes');

    // Arriving from the belt default, the cycle restarts at first asc.
    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=desc');

    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=desc');
  });

  it('shows the same signifier the roster shows, in the same place', () => {
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@athletes');

    // Neutral while belt drives the sort — the header is not what is ordering
    // the list, and a lit-up arrow there would say it was.
    cy.get('[data-cy="attendance-th-name"] .sort-header__signifier')
      .should('have.text', '↕')
      .and('not.have.class', 'sort-header__signifier--active');

    cy.get('[data-cy="attendance-th-name"]').click();
    cy.wait('@athletes');

    cy.get('[data-cy="attendance-th-name"] .sort-header__signifier')
      .should('have.text', 'F↑')
      .and('have.class', 'sort-header__signifier--active');
  });

  it('the belt control reaches a phone, where the table header does not exist', () => {
    // Below 768px the table is hidden and the card list renders instead, so a
    // sort that lives in a `<th>` is desktop-only — the reason #1443 moved the
    // roster's copy into the filter row, and the reason this one starts there.
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    cy.visitAuthenticated('/dashboard/attendance');
    cy.wait('@athletes');

    cy.get('[data-cy="attendance-list"]').should('not.be.visible');
    cy.get('[data-cy="attendance-sort-belt"]').should('be.visible').click();
    cy.wait('@athletes').its('request.url').should('include', 'sort_by=belt');
  });
});
