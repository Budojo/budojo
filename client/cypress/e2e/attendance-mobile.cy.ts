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
      cy.intercept('GET', '/api/v1/attendance*', ATTENDANCE_EMPTY);
      cy.visitAuthenticated('/dashboard/attendance');
    });

    it('renders the page + the date picker + the roster without horizontal overflow', () => {
      cy.get('[data-cy="attendance-page"]').should('be.visible');
      cy.get('[data-cy="attendance-date"]').should('be.visible');
      cy.get('[data-cy="attendance-list"]').should('be.visible');
      cy.get('[data-cy="attendance-row-1"]').should('be.visible').and('contain.text', 'Mario');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
