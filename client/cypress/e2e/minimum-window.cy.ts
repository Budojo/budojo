import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_MIN_WINDOW } from '../support/viewports';

/**
 * The desktop window can be 960 × 600 — `desktop/src/main.ts` says so
 * (`minWidth: 960, minHeight: 600`), and the v2.61 audit shot every screen
 * at that size. Two headers broke only there (#1632): the roster's filter
 * row refused to wrap and squeezed the search to ~85 px, and the check-in's
 * title split across three lines beside a narrow count column.
 *
 * Not a mobile spec — the phone layouts are their own files. This one asks
 * the question the audit asked: at the smallest window the app can have, is
 * anything unusable?
 */
const ATHLETES = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Giulia',
        last_name: 'Ferraro',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        date_of_birth: '1994-03-02',
        joined_at: '2024-09-02',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        instagram_url: null,
        facebook_url: null,
        photo_url: null,
        paid_at: null,
        deleted_at: null,
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
  },
};

describe('At the smallest window the desktop can have (#1632)', () => {
  beforeEach(() => {
    cy.viewport(VIEWPORT_MIN_WINDOW.width, VIEWPORT_MIN_WINDOW.height);
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [], missing_medical_certificate: [] },
    });
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES).as('athletes');
    // Anything under /me answering 401 logs the session out and bounces to
    // the login page — which is what was happening here before these stubs.
    cy.intercept('GET', '/api/v1/me/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy/classes*', { statusCode: 200, body: { data: [] } });
  });

  it('leaves the roster search wide enough to type into', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    // It used to shrink to ~85 px, where the placeholder read "Cer".
    cy.get('[data-cy="athletes-search-input"]').then(($input) => {
      expect($input[0].getBoundingClientRect().width).to.be.greaterThan(240);
    });

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('keeps the check-in title on its own line, with the count under it', () => {
    // One present athlete, so the header has a count to place — whatever day
    // the suite runs on, and whichever day the page reseats itself to.
    cy.intercept('GET', '/api/v1/attendance*', (req) => {
      const date = new URL(req.url).searchParams.get('date') ?? '';
      req.reply({
        statusCode: 200,
        body: { data: [{ id: 1, athlete_id: 1, lesson_id: null, attended_on: date }] },
      });
    });
    cy.visitAuthenticated('/dashboard/attendance');

    cy.get('[data-cy="attendance-page"]', { timeout: 10_000 }).should('exist');
    cy.get('[data-cy="page-header-count"]', { timeout: 10_000 }).should('exist');

    cy.get('[data-cy="page-header-title"]').then(($title) => {
      const title = $title[0].getBoundingClientRect();
      cy.get('[data-cy="page-header-count"]').then(($count) => {
        // Under, not beside: the count used to take a column of its own and
        // break the title into three lines.
        expect($count[0].getBoundingClientRect().top).to.be.at.least(title.bottom - 2);
      });
    });

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
