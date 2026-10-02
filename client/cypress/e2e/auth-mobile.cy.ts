import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the login + register flows (#240).
// Auth is the most-visited cold path for prospects landing from the
// new marketing page (#330) and for returning instructors signing in
// from their phone — broken layout here is the loudest possible
// first impression, so we cover both pages at the two tightest
// mainstream viewports.

// One rhythm between the fields (#2034): the forms stacked them flush, a
// label against the input above it, the consents against the password. A
// card that adds its own margins on top of the shared gap doubles it.
function expectFieldRhythm(): void {
  cy.get('form')
    .children()
    .then(($fields) => {
      const boxes = [...$fields]
        .map((field) => field.getBoundingClientRect())
        .filter((box) => box.height > 0);
      for (let i = 1; i < boxes.length; i++) {
        const gap = boxes[i].top - boxes[i - 1].bottom;
        expect(gap, `gap before field ${i + 1}`).to.be.at.least(16);
        expect(gap, `gap before field ${i + 1}`).to.be.at.most(24);
      }
    });
}

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

    it('leaves room between one field and the next', () => {
      expectFieldRhythm();
    });

    it('renders the register form without horizontal overflow', () => {
      cy.get('input[id="first_name"]').should('be.visible');
      cy.get('input[id="last_name"]').should('be.visible');
      cy.get('input[id="email"]').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });

  describe(`Athlete invite fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/athlete-invite/*/preview', {
        statusCode: 200,
        body: {
          data: {
            first_name: 'Luca',
            last_name: 'Bianchi',
            email: 'luca@example.com',
            academy_name: 'Kaizen',
            expires_at: '2026-12-01T00:00:00Z',
          },
        },
      });
      cy.visit(`/athlete-invite/${'a'.repeat(64)}`);
    });

    it('leaves room between one field and the next', () => {
      cy.get('form').should('be.visible');
      expectFieldRhythm();
    });
  });
});
