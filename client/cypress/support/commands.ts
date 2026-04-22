// Make this file an ES module so the global augmentation is valid
export {};

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visit a URL with a fake auth token pre-seeded in localStorage.
       * The Angular app reads auth_token on init, so the authGuard passes.
       */
      visitAuthenticated(url: string, token?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('visitAuthenticated', (url: string, token = 'fake-token') => {
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.setItem('auth_token', token);
    },
  });
});
