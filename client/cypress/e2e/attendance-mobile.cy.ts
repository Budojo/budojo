import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the daily Attendance page (#240). The
// most "tap-heavy" page in the app — the instructor uses it on the
// side of the mat with the phone in one hand. Layout overflow at a
// narrow viewport is the loudest possible regression on this page.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };
const ATHLETES_TWO = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2024-01-10',
        created_at: '2024-09-01T10:00:00+00:00',
      },
      {
        id: 2,
        first_name: 'Luigi',
        last_name: 'Verdi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1985-09-20',
        belt: 'purple',
        stripes: 1,
        status: 'active',
        joined_at: '2023-06-01',
        created_at: '2024-09-01T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      path: '',
      per_page: 20,
      to: 2,
      total: 2,
    },
  },
};
const ATTENDANCE_EMPTY = { statusCode: 200, body: { data: [] } };

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Daily attendance fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.intercept('GET', '/api/v1/academy/classes', ATTENDANCE_EMPTY);
      cy.intercept('GET', '/api/v1/attendance*', ATTENDANCE_EMPTY);
      cy.visitAuthenticated('/dashboard/attendance');
    });

    it('renders the page + the date picker + the roster without horizontal overflow', () => {
      cy.get('[data-cy="attendance-page"]').should('be.visible');
      cy.get('[data-cy="attendance-date"]').should('be.visible');

      // Below 768px the desktop <p-table> (`attendance-list`) is
      // display:none and the mobile card list (`attendance-mobile-list`)
      // renders the roster instead — same togglePresent handler, same
      // aria semantics, different DOM. Audit row 5 shipped this in PR
      // #677 (audit doc: docs/design/mobile-ux-audit.md).
      cy.get('[data-cy="attendance-mobile-list"]').should('be.visible');
      cy.get('[data-cy="attendance-card-1"]').should('be.visible').and('contain.text', 'Mario');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});

// The missing-regulars panel (#1730) on the phone held in one hand: two
// icon buttons per row and the habit under the name, never a sideways
// scroll. Its behaviour is covered at desktop width in
// `attendance-missing.cy.ts`; this is only its layout.
const FUNDAMENTALS = {
  id: 2,
  name: 'Fundamentals',
  weekday: 1,
  starts_at: '19:00',
  duration_minutes: 60,
  kind: 'gi',
};
const REGULARS = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 3,
        first_name: 'Annamaria',
        last_name: 'Bianchi-Castelfranchi',
        belt: 'purple',
        stripes: 3,
        date_of_birth: '1992-03-01',
        photo_url: null,
        user_avatar_url: null,
        phone_country_code: '+39',
        phone_national_number: '3471234567',
        attended: 4,
        last_attended_on: '2026-09-10',
      },
    ],
    meta: {
      occurrences: 4,
      occurrence_dates: ['2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17'],
    },
  },
};

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Missing regulars fit on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.clock(new Date(2026, 8, 14, 18, 30).getTime(), ['Date']);
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } });
      cy.intercept('GET', '/api/v1/academy/classes', {
        statusCode: 200,
        body: { data: [FUNDAMENTALS] },
      });
      cy.intercept('GET', '/api/v1/attendance*', ATTENDANCE_EMPTY);
      cy.intercept('GET', '/api/v1/attendance/regulars*', REGULARS).as('regulars');
      cy.visitAuthenticated('/dashboard/attendance');
      cy.wait('@regulars');
    });

    it('opens without a sideways scroll, with both ways to reach them in reach', () => {
      cy.get('[data-cy="missing-regulars-toggle"]').click();
      cy.get('[data-cy="missing-regular-3"]').should('be.visible');
      cy.get('[data-cy="missing-contact-3-whatsapp"]').should('be.visible');
      cy.get('[data-cy="missing-contact-3-call"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
