import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_PIXEL_8_PRO } from '../support/viewports';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};
const ACADEMY_NOT_FOUND = { statusCode: 404, body: {} };
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Navigation guards', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // M3.4 widget fires on /dashboard/athletes load; stub to avoid proxy noise.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('redirects unauthenticated visitor from / to /auth/login', () => {
    cy.visit('/');
    cy.url().should('include', '/auth/login');
  });

  it('redirects unauthenticated visitor from /dashboard to /auth/login', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/auth/login');
  });

  it('redirects unauthenticated visitor from /setup to /auth/login', () => {
    cy.visit('/setup');
    cy.url().should('include', '/auth/login');
  });

  it('lets an authenticated user with no academy reach /setup', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NOT_FOUND).as('academy');
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
    cy.url().should('include', '/setup');
    cy.get('h1').should('contain', 'Set up your academy');
  });

  it('redirects authenticated user with academy from /setup to /dashboard', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard');
  });

  it('redirects authenticated user with no academy from /dashboard to /setup', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NOT_FOUND).as('academy');
    cy.visitAuthenticated('/dashboard');
    cy.wait('@academy');
    cy.url().should('include', '/setup');
  });

  it('lets an authenticated user with academy reach /dashboard/athletes', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');
    cy.url().should('include', '/dashboard/athletes');
  });
});

describe('Sidebar brand + sign out', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders the academy name as the dominant sidebar brand (non-interactive after #166)', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('.sidebar__brand-name').should('contain.text', 'Test Academy');
    // After #166 the brand area is a static <div>, not a dropdown trigger.
    cy.get('[data-cy="sidebar-brand"]').should('exist').and('not.have.attr', 'aria-haspopup');
  });

  // #166 retired the brand-dropdown signout. The bottom-of-sidebar row is
  // the only signout entry point now — covered below.
  it('signs the user out via the sidebar footer button (only signout entry after #166)', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('[data-cy="nav-sign-out"]').click();
    cy.url().should('include', '/auth/login');
  });
});

// ── #68 — topbar wordmark links to /dashboard home ──────────────────────────

describe('Topbar home link', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('navigates to /dashboard when the Budojo wordmark is tapped', () => {
    // Topbar is mobile-only (`display: none` above the sidebar breakpoint
    // — see dashboard.component.scss). Cypress defaults to 1280×720 which
    // hides it. Flip to a representative mobile viewport from the shared
    // preset (#240) so the link is visible and the `.click()` actionability
    // check passes.
    cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
    // Alias + wait on the guard-triggered requests, same pattern the rest
    // of this file uses. Clicking the topbar link before hasAcademyGuard
    // resolves can race the redirect under guard on slower CI runs.
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');

    // Start somewhere non-home so the redirect is observable.
    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/academy');

    cy.get('[data-cy="topbar-home-link"]').click();
    cy.wait('@athletes');
    // /dashboard redirects to /dashboard/athletes by default.
    cy.url().should('include', '/dashboard/athletes');
  });
});
