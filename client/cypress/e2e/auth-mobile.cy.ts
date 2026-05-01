import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the login + register flows (#240).
// Auth is the most-visited cold path for prospects landing from the
// new marketing page (#330) and for returning instructors signing in
// from their phone — broken layout here is the loudest possible
// first impression, so we cover both pages at the two tightest
// mainstream viewports.

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Auth login fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.visit('/auth/login');
    });

    it('renders the login form without horizontal overflow', () => {
      cy.get('input[id="email"]').should('be.visible');
      cy.get('input[id="password"]').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });

  describe(`Auth register fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.visit('/auth/register');
    });

    it('renders the register form without horizontal overflow', () => {
      cy.get('input[id="name"]').should('be.visible');
      cy.get('input[id="email"]').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
