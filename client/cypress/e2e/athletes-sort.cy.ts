import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_IPHONE_SE } from '../support/viewports';

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

const ONE_BROWN_BELT = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        phone_country_code: '+39',
        phone_national_number: '3331234567',
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'brown',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        created_at: '2026-04-22T10:00:00+00:00',
        attendance_month_count: 6,
        attendance_total_count: 214,
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
  },
};

describe('athletes table — column sorting', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance/summary*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes*', { statusCode: 200, body: EMPTY_PAGE }).as('athletes');
    // These tests are about the ROSTER's query. An empty roster also triggers
    // the "is everyone just inactive?" count (#1666), which hits the same
    // endpoint and would otherwise land in `@athletes` — so `cy.wait` could
    // resolve to it and assert a sort on a request that carries none.
    // Registered after the line above, because a later intercept wins.
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/athletes', query: { status: 'inactive' } },
      { statusCode: 200, body: EMPTY_PAGE },
    ).as('inactiveCount');
  });

  it('asks for belt descending before anyone touches a control (#1457)', () => {
    cy.visitAuthenticated('/dashboard/athletes');

    // The roster opens on rank, highest first. Asserted on the wire because
    // the default is worth nothing if it only exists in the component — the
    // server does the ranking.
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');
  });

  it('flips between the two belt directions and never turns itself off (#1457)', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // Belt sorting left the table header in #1443 — the header did not exist
    // on a phone, so this was desktop-only while it was a column.
    cy.get('[data-cy="athletes-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=asc');

    // Second press goes back to descending rather than to no sort at all:
    // "off" would drop the reader into insertion order, which is where the
    // list used to open and the reason #1457 changed the default.
    cy.get('[data-cy="athletes-sort-belt"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=belt')
      .and('include', 'sort_order=desc');
  });

  it('the spine still says the belt in words, now that the column is gone (#1443)', () => {
    // The whole case for deleting the Belt column rests on this: on desktop
    // the spine is the row's ONLY belt, and a colour is not a name. The
    // aria-label covers a screen reader; this covers the sighted reader who
    // cannot tell brown from black in a 9px stripe. It is also the guard for
    // the `pointer-events` rule the spine carries — set that back to `none`
    // and the tooltip silently stops opening, with nothing else to notice.
    cy.intercept('GET', '/api/v1/athletes*', ONE_BROWN_BELT).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('.athlete-identity__spine').first().trigger('mouseenter');
    cy.get('.p-tooltip').should('be.visible').and('contain.text', 'Brown');
  });

  it('the belt control reaches a phone, which the column header never did (#1443)', () => {
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('[data-cy="athletes-sort-belt"]').should('be.visible').click();
    cy.wait('@athletes').its('request.url').should('include', 'sort_by=belt');
  });

  it('cycles the Attendance header through its own 4 states (#1447)', () => {
    // Counts sort descending first, unlike the names beside them: a count
    // column is opened with "who trains most". The column only exists when
    // the payload carried counts, so the fixture has to supply them.
    cy.intercept('GET', '/api/v1/athletes*', ONE_BROWN_BELT).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('[data-cy="athletes-th-attendance"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=attendance_month')
      .and('include', 'sort_order=desc');

    cy.get('[data-cy="athletes-th-attendance"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=attendance_month')
      .and('include', 'sort_order=asc');

    // Third press hands the lead to the all-time count — the second number
    // the column shows, which a 2-state cycle could never reach.
    cy.get('[data-cy="athletes-th-attendance"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=attendance_total')
      .and('include', 'sort_order=desc');
  });

  it('drops the Attendance column when the payload has no counts (#1447)', () => {
    // A pre-#1447 server. Showing zeroes would say nobody has ever trained.
    //
    // The rows have to be REAL rows without counts: falling through to the
    // beforeEach intercept returns an empty page, and the column is then
    // absent because there is nothing to render at all — a test that passes
    // for the wrong reason and would keep passing if the gate were deleted.
    const noCounts = structuredClone(ONE_BROWN_BELT);
    delete noCounts.body.data[0].attendance_month_count;
    delete noCounts.body.data[0].attendance_total_count;
    cy.intercept('GET', '/api/v1/athletes*', noCounts).as('athletes');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.contains('tbody tr', 'Rossi').should('be.visible');
    cy.get('[data-cy="athletes-th-attendance"]').should('not.exist');
  });

  it('cycles the Full name header through 4 states (#196)', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // The Full name column is a synthetic field — first_name + last_name —
    // so a single 2-state sort would leave same-first-name athletes in
    // arbitrary tiebreak order. The 4-state cycle picks both the leading
    // name and the direction; the backend tiebreaks on the OTHER name in
    // the same direction (see AthleteController::applyNameSort).
    //
    // Cycle: neutral → first asc → first desc → last asc → last desc → first asc

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=desc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=asc');

    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=last_name')
      .and('include', 'sort_order=desc');

    // Loops back to the first state.
    cy.get('[data-cy="athletes-th-name"]').click();
    cy.wait('@athletes')
      .its('request.url')
      .should('include', 'sort_by=first_name')
      .and('include', 'sort_order=asc');
  });
});
