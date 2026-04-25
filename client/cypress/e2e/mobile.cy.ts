export {};

// M3.5 — mobile viewport smoke tests. Runs every spec at 390 × 844
// (iPhone 13 portrait). The goal is to assert the shell behaves
// correctly on a small viewport, not to re-test every feature — those
// feature specs run at the Cypress default viewport and cover the
// business logic.

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: { id: 1, name: 'Test Academy', slug: 'test-academy', address: null, logo_url: null } },
};

const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Mobile shell (390 × 844)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(390, 844);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('shows the topbar hamburger and hides the off-canvas sidebar on load', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="topbar-hamburger"]').should('be.visible');
    cy.get('[data-cy="topbar-hamburger"]').should('have.attr', 'aria-expanded', 'false');

    // Sidebar element is in the DOM but off-canvas — its brand-name text
    // should not be in the reachable tap zone (translateX(-100%)).
    cy.get('[data-cy="drawer-backdrop"]').should('not.exist');
  });

  it('opens the drawer on hamburger tap and closes it on backdrop tap', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="topbar-hamburger"]').click();
    cy.get('[data-cy="topbar-hamburger"]').should('have.attr', 'aria-expanded', 'true');
    // `.exist` over `.be.visible`: the backdrop is conditionally mounted
    // via `@if (sidebarOpen())`, so existing in the DOM IS the assertion
    // we want. Cypress' `be.visible` runs the same "not covered" check
    // that biases the click() below — at this viewport the sidebar
    // covers the backdrop's center and the visibility check would
    // false-fail even though the user can clearly see the right edge.
    cy.get('[data-cy="drawer-backdrop"]').should('exist');
    cy.get('.sidebar--open').should('exist');
    cy.get('.sidebar__brand-name').should('contain.text', 'Test Academy');

    // The backdrop is a full-viewport fixed element, but at 390×844 the
    // sidebar (16 rem = 256 px) covers the left 2/3. Cypress runs a
    // visibility check on the ELEMENT (not the click coord) before the
    // click — and "covered by another element" makes the whole element
    // fail visibility upfront, so `.click('right')` alone doesn't escape.
    // `{ force: true }` is Cypress' documented bypass for this case
    // (https://docs.cypress.io/guides/core-concepts/interacting-with-elements#Visibility):
    // the element IS user-visible at the chosen coord, the geometry
    // check is just wrong. Real users tap there every day.
    cy.get('[data-cy="drawer-backdrop"]').click('right', { force: true });
    cy.get('[data-cy="drawer-backdrop"]').should('not.exist');
    cy.get('[data-cy="topbar-hamburger"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('closes the drawer when a nav link is tapped', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="topbar-hamburger"]').click();
    cy.get('.sidebar__nav-item').contains('Athletes').click();

    // Already on /dashboard/athletes; the closeSidebar side-effect still fires.
    cy.get('[data-cy="drawer-backdrop"]').should('not.exist');
  });

  it('athletes list page fits the viewport (no horizontal overflow)', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    // scrollWidth equal to clientWidth (give or take 1px) = no runaway overflow
    // at the outer body. Tables may have their own horizontal scroll; that's
    // acceptable and enclosed.
    cy.window().then((win) => {
      const b = win.document.body;
      expect(b.scrollWidth).to.be.at.most(b.clientWidth + 1);
    });
  });

  it('exposes the PWA manifest link in <head>', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.get('link[rel="manifest"]').should('have.attr', 'href', 'manifest.webmanifest');
    cy.get('link[rel="apple-touch-icon"]').should('exist');
    // Canon surface-900 — matches the dark app-icon tile + manifest theme.
    // Pre-v3 this was #6366f1 (indigo accent); v3 aligned it to the tile so
    // Chrome's mobile status bar matches the installed icon's background.
    cy.get('meta[name="theme-color"]').should('have.attr', 'content', '#0a0a0b');
    cy.get('meta[name="apple-mobile-web-app-capable"]').should('have.attr', 'content', 'yes');
  });
});
