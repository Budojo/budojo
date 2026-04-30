import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport smoke tests for the athletes list — the SPA's most
// trafficked screen for the instructor on the mat (#240). Existing
// athletes-sort.cy.ts and athletes-form.cy.ts cover business logic
// at the desktop default; this spec is layout-only at narrow widths,
// so a CSS regression like #238 (phone-cc ellipsis on Pixel 8 Pro)
// gets caught before reaching production.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

const ATHLETES_TWO = {
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
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        created_at: '2026-04-22T10:00:00+00:00',
      },
      {
        id: 2,
        first_name: 'Luigi',
        last_name: 'Verdi',
        email: 'luigi@example.com',
        phone_country_code: '+39',
        phone_national_number: '3339876543',
        address: null,
        date_of_birth: '1985-09-20',
        belt: 'purple',
        stripes: 1,
        status: 'active',
        joined_at: '2022-06-01',
        created_at: '2026-04-22T10:00:00+00:00',
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

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Athletes list — mobile smoke (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
      cy.intercept('GET', /\/api\/v1\/athletes(\?|$)/, ATHLETES_TWO).as('athletes');
      cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    });

    it('renders the athlete list without horizontal-scrolling the body', () => {
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      // Body's scrollWidth must equal clientWidth — anything wider means
      // a child element broke out of the viewport (a fixed-width column,
      // a non-wrapping label, etc.) and the user has to scroll sideways
      // to see it. That is the kind of mobile layout bug we want CI to
      // catch.
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'document.scrollWidth').to.be.lte(root.clientWidth);
      });
    });

    it('renders the athlete rows + the list shows both Mario and Luigi', () => {
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      cy.contains('Mario').should('be.visible');
      cy.contains('Luigi').should('be.visible');
    });
  });
});
