import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the Academy edit form (#240). Same
// rationale as the athlete form spec — multi-field surface with
// phone country code + structured address + monthly fee, all
// historically prone to overflow regressions at narrow widths.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const ATHLETES_EMPTY = {
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
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Academy edit form fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.visitAuthenticated('/dashboard/academy/edit');
    });

    it('renders the form without horizontal overflow', () => {
      cy.get('[data-cy="academy-form"]').should('be.visible');
      cy.get('[data-cy="academy-form-name"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
