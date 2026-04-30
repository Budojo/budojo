import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * Public privacy-policy page (#219). The route is unauthenticated — a
 * prospect must be able to read it before they tick the consent box
 * during registration. The spec pins:
 *
 *  - the page renders without auth setup
 *  - the draft-status banner is visible (interim-disclosure UX)
 *  - the version + last-updated stamp is rendered
 *  - the back-home CTA navigates to the root
 *  - layout fits on every mobile viewport (no horizontal overflow)
 *
 * Layout overflow is the load-bearing assertion: a long Italian
 * GDPR table can break the trigger row at 375px wide if a future
 * edit forgets to wrap a `min-width: 36rem` table in a scrollable
 * container. CSS `text-overflow: ellipsis` would silently hide the
 * regression — `scrollWidth <= clientWidth` does not.
 */

describe('Privacy policy page (#219) — content + chrome', () => {
  beforeEach(() => {
    cy.visit('/privacy');
  });

  it('renders the title, the draft banner, and the version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', 'Informativa sulla Privacy');
    cy.get('[data-cy="privacy-draft-banner"]').should('be.visible').and('contain.text', 'Bozza');
    cy.get('[data-cy="privacy-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Versione')
      .and('contain.text', '2026-04-30');
  });

  it('the back-home CTA navigates away from /privacy (root redirects to /auth/login for unauth visitors)', () => {
    cy.get('[data-cy="privacy-home"]').click();
    // The component calls `router.navigateByUrl('/')`; the public-route
    // table at app.routes.ts then redirects unauthenticated visitors
    // to /auth/login. We assert on the end state Cypress observes,
    // not on the intermediate navigation target.
    cy.location('pathname').should('eq', '/auth/login');
  });

  it('cross-links to /sub-processors so the chain stays auditable', () => {
    cy.contains('a[href="/sub-processors"]', '/sub-processors').should('exist');
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Privacy policy fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.visit('/privacy');
    });

    it('document does not overflow horizontally', () => {
      // The whole-document scrollWidth assertion is the most general
      // signal — a single greedy child (an oversized table without
      // a scroll wrapper, an unbreakable email link) would push the
      // body wider than the viewport and the user would see a
      // horizontal scrollbar. We assert ZERO overflow at the body
      // level rather than per-child to keep the spec resilient to
      // markup churn.
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
