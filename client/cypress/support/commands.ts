// Make this file an ES module so the global augmentation is valid
export {};

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visit a URL with a fake auth token pre-seeded in localStorage.
       * The Angular app reads auth_token on init, so the authGuard passes.
       *
       * `extra` merges on top of the built-in `cy.visit` options; if it
       * carries its own `onBeforeLoad`, it runs AFTER the auth-token seed
       * so callers can additionally freeze time, stub globals, etc.
       */
      visitAuthenticated(
        url: string,
        token?: string,
        extra?: Partial<Cypress.VisitOptions>,
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  'visitAuthenticated',
  (url: string, token = 'fake-token', extra?: Partial<Cypress.VisitOptions>) => {
    cy.visit(url, {
      ...extra,
      onBeforeLoad(win) {
        win.localStorage.setItem('auth_token', token);
        extra?.onBeforeLoad?.(win);
      },
    });
  },
);
