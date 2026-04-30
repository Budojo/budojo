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
        // Pin the language to English (#273) so all text-content
        // assertions across the spec base remain deterministic. Tests
        // that need to assert the Italian translation can override
        // by setting `budojoLang` to `'it'` before the visit, or
        // toggle it through the sidebar after landing.
        win.localStorage.setItem('budojoLang', 'en');
        extra?.onBeforeLoad?.(win);
      },
    });
  },
);
