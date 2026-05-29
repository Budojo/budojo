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
const OWNER_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      first_name: 'Sensei',
      last_name: 'Mario',
      full_name: 'Sensei Mario',
      handle: 'senseimario',
      email: 'sensei@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
    },
  },
};

describe('Navigation guards', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // M3.4 widget fires on /dashboard/athletes load; stub to avoid proxy noise.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('lands unauthenticated visitor on the public landing page at / (#330)', () => {
    // Pre-#330 behaviour: cold visit to / redirected to /auth/login.
    // Post-#330: the root is the public landing / about page; login
    // is one click away in the header. The auth-redirect from
    // /dashboard and /setup is unchanged (those tests below).
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.get('.landing__hero-headline').should('be.visible');
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

describe('Rail brand (#1112)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Catch-all + /auth/me so the shell hydrates without an unmocked call
    // 401-ing through the dev proxy (which bounces the spec to /auth/login).
    // The per-test academy/athletes intercepts register later, so they win.
    cy.intercept('GET', '/api/v1/**', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/auth/me*', OWNER_ME);
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders the academy name as the dominant rail brand, linking to the academy home (#1112)', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('.rail__brand-text').should('contain.text', 'Test Academy');
    // The dense sidebar is retired (#1112) — the rail brand is now a link to
    // the academy home (the pi-home Home tab), matching its aria-label.
    cy.get('a.rail__brand').should('have.attr', 'href').and('include', '/dashboard/academy');
  });

  // Sign-out moved off the desktop sidebar into the owner More hub with the
  // rail refactor (#1112) — its click → /auth/login flow is covered by
  // owner-more.component.spec.ts (owner-more-signout).
});

// ── #68 — topbar wordmark links to /dashboard home ──────────────────────────

describe('Topbar home link', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Catch-all + /auth/me so the shell hydrates without an unmocked call
    // 401-ing through the dev proxy (which bounces the spec to /auth/login).
    cy.intercept('GET', '/api/v1/**', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/auth/me*', OWNER_ME);
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('navigates to the academy home when the Budojo wordmark is tapped (#1112)', () => {
    // Topbar is mobile-only (`display: none` above the sidebar breakpoint
    // — see dashboard.component.scss). Cypress defaults to 1280×720 which
    // hides it. Flip to a representative mobile viewport from the shared
    // preset (#240) so the link is visible and the `.click()` actionability
    // check passes.
    cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');

    // Start on the athletes roster (the default landing) so the brand →
    // academy-home navigation is observable.
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/athletes');

    cy.get('[data-cy="topbar-home-link"]').click();
    // The brand points at the academy home (#1112), not the /dashboard index.
    cy.url().should('include', '/dashboard/academy');
  });

  it('the /dashboard index still redirects to the athletes roster', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/athletes');
  });
});
