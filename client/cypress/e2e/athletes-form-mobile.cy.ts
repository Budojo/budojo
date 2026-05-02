import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the athlete create/edit form (#240).
// The form is field-heavy (name, email, phone, address, belt, status,
// dates, contact links) — exactly the surface where overflow regressions
// appeared on Pixel 8 Pro before #239. This spec keeps the layout
// invariant locked across both mainstream mobile widths.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Athlete create form fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.visitAuthenticated('/dashboard/athletes/new');
    });

    it('renders the form without horizontal overflow', () => {
      cy.get('[data-cy="athlete-form"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
