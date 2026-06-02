import { MOCK_ACADEMY } from '../support/fixtures';

// M3.5 — mobile viewport smoke tests. Runs at 390 × 844 (iPhone 13
// portrait). Asserts the owner shell behaves on a small viewport — since
// the social-native nav refactor (#1111) that's the bottom tab bar + a
// center ➕ create sheet; the hamburger off-canvas drawer is retired.
// Feature specs run at the Cypress default viewport and cover the business
// logic.

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
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
    // Catch-all FIRST so no unmocked background GET (e.g. the notification
    // bell's /me/notifications hydrate) reaches the dev server and re-renders
    // the shell mid-interaction — that surfaced as `cy.click()` "page updated
    // while executing" flakes on the bottom-nav buttons. Specific overrides
    // are registered after, so they win (Cypress resolves the most-recently-
    // defined matching intercept).
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('shows the bottom tab bar on load and retires the hamburger drawer', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="bottomnav-athletes"]').should('be.visible');
    cy.get('[data-cy="bottomnav-create"]').should('be.visible');
    cy.get('[data-cy="bottomnav-more"]').should('be.visible');

    // The off-canvas drawer + its hamburger are gone (#1111).
    cy.get('[data-cy="topbar-hamburger"]').should('not.exist');
    cy.get('[data-cy="drawer-backdrop"]').should('not.exist');
  });

  it('opens the ➕ create sheet from the center button and dismisses it', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[role="dialog"]').should('not.exist');

    cy.get('[data-cy="bottomnav-create"]').click();
    cy.get('[role="dialog"]').should('exist');
    cy.get('[data-cy="create-attendance"]').should('be.visible');
    cy.get('[data-cy="create-athlete"]').should('be.visible');
    cy.get('[data-cy="create-post"]').should('be.visible');

    // Esc closes the p-dialog bottom sheet.
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('navigates to the More hub from the bottom-nav More tab', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    cy.get('[data-cy="bottomnav-more"]').click();
    cy.location('pathname').should('eq', '/dashboard/more');
    cy.get('[data-cy="owner-more"]').should('be.visible');
    cy.get('[data-cy="owner-more-signout"]').should('be.visible');
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

  it('pins the manifest orientation to portrait for installed PWAs (#1186)', () => {
    // Budojo is portrait-first. The manifest `orientation` locks an installed
    // standalone PWA on Android (Chrome honours it; Android 15+ still lets
    // large screens override). The Play Store TWA is locked separately in its
    // native config (`android:screenOrientation=portrait`, twa-manifest.json).
    cy.request('manifest.webmanifest')
      .its('body')
      .should((manifest) => {
        expect(manifest.orientation).to.eq('portrait');
      });
  });
});
