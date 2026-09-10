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

    it('lets the width scale collapse to the phone column (#1485)', () => {
      // The invariant a `max-width` buys, and a `width` would not: on one
      // column every field fills the track, whatever cap it carries at desktop.
      //
      // Asserting `width <= viewportWidth` instead — which is what this test
      // said first — proves nothing: the caps are 176px and 272px against a
      // 375px phone, so it holds for a hard `width`, for the cap, and for no
      // rule at all.
      cy.get('#first_name').then(($el) => {
        const field = $el[0].closest('app-budojo-form-field') as HTMLElement;
        const row = field.parentElement as HTMLElement;
        expect(
          field.getBoundingClientRect().width,
          'a --medium field fills its single-column track',
        ).to.be.closeTo(row.getBoundingClientRect().width, 1);
      });
      cy.get('#date_of_birth').then(($el) => {
        const field = $el[0].closest('app-budojo-form-field') as HTMLElement;
        const row = field.parentElement as HTMLElement;
        expect(
          field.getBoundingClientRect().width,
          'a --short field fills its single-column track',
        ).to.be.closeTo(row.getBoundingClientRect().width, 1);
      });
    });
  });
});
