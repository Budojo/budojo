import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_PIXEL_8_PRO } from '../support/viewports';

/**
 * Runtime capability list (#1229). The API reports what the runtime offers;
 * on the desktop profile the multi-user surfaces are absent — from the nav,
 * from the routes, from the pre-auth pages. Every other spec runs with the
 * endpoint unmocked and therefore the web default (everything), so this file
 * is the only place the narrowed set is exercised end to end.
 */
const DESKTOP_RUNTIME = {
  statusCode: 200,
  body: { data: { profile: 'desktop', capabilities: [] } },
};
const WEB_RUNTIME = {
  statusCode: 200,
  body: {
    data: {
      profile: 'web',
      capabilities: ['community', 'athlete_accounts', 'web_push', 'email', 'password_breach_check'],
    },
  },
};
const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Desktop runtime capabilities (#1229)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
  });

  it('drops community from the mobile bottom nav when the runtime lacks it', () => {
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@runtime');

    cy.get('[data-cy="bottomnav-athletes"]').should('be.visible');
    cy.get('[data-cy="bottomnav-community"]').should('not.exist');
  });

  it('keeps community in the nav on the web runtime', () => {
    cy.intercept('GET', '/api/v1/runtime', WEB_RUNTIME).as('runtime');
    cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@runtime');

    cy.get('[data-cy="bottomnav-community"]').should('be.visible');
  });

  it('redirects a stale community deep link to the dashboard', () => {
    // A bookmarked feed on a runtime with no community must not render a
    // shell whose every request would 404 — the guard sends it home.
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.visitAuthenticated('/dashboard/community');

    cy.location('pathname').should('not.include', '/community');
    cy.location('pathname').should('include', '/dashboard');
  });

  it('hides the forgot-password link when the runtime cannot send email', () => {
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.visit('/auth/login');
    cy.wait('@runtime');

    cy.get('[data-cy="auth-forgot-password-link"]').should('not.exist');
  });

  it('turns away a bookmarked password-reset link when the runtime cannot send email (#1620)', () => {
    // The login page stopped showing the link in #1229, but the routes
    // themselves stayed open: a bookmark or the back button reached a form
    // promising a link in an inbox nothing can post to. The guard sends the
    // visitor to /dashboard, which — signed out — is the login page.
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.visit('/auth/forgot-password');

    cy.location('pathname').should('not.include', 'forgot-password');
    cy.get('[data-cy="login-form"], [data-cy="auth-login-form"], form').should('exist');
  });

  it('turns away the reset-password form too (#1620)', () => {
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.visit('/auth/reset-password?token=whatever&email=a@b.c');

    cy.location('pathname').should('not.include', 'reset-password');
  });

  it('keeps both password-reset pages on the web runtime (#1620)', () => {
    cy.intercept('GET', '/api/v1/runtime', WEB_RUNTIME).as('runtime');
    cy.visit('/auth/forgot-password');
    cy.wait('@runtime');

    cy.location('pathname').should('include', 'forgot-password');
  });

  it('hides the athlete-invitation notice on register when there are no athlete accounts', () => {
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.visit('/auth/register');
    cy.wait('@runtime');

    cy.get('[data-cy="register-athlete-notice"]').should('not.exist');
  });

  it('drops the email promises from the notifications settings (#1619)', () => {
    cy.intercept('GET', '/api/v1/runtime', DESKTOP_RUNTIME).as('runtime');
    cy.intercept('GET', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: { data: {} },
    }).as('prefs');
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@runtime');
    cy.get('[data-cy="profile-tab-notifications"]').click();
    cy.wait('@prefs');

    // Five transactional emails nothing can send, and the feed's own
    // notifications on a runtime with no feed.
    cy.get('[data-cy="profile-notifications-transactional"]').should('not.exist');
    cy.get('[data-cy="profile-notifications-group-community"]').should('not.exist');
    // The RSVP alert lives in the OWNER group and is community's all the same.
    cy.get('[data-cy="profile-notifications-row-owner_event_rsvp"]').should('not.exist');
    // What still reaches the bell stays.
    cy.get('[data-cy="profile-notifications-row-unpaid_athletes_digest"]').should('exist');
  });

  it('keeps them on the web runtime (#1619)', () => {
    cy.intercept('GET', '/api/v1/runtime', WEB_RUNTIME).as('runtime');
    cy.intercept('GET', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: { data: {} },
    }).as('prefs');
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@runtime');
    cy.get('[data-cy="profile-tab-notifications"]').click();
    cy.wait('@prefs');

    cy.get('[data-cy="profile-notifications-transactional"]').should('exist');
    cy.get('[data-cy="profile-notifications-group-community"]').should('exist');
    cy.get('[data-cy="profile-notifications-row-owner_event_rsvp"]').should('exist');
  });

  it('shows both pre-auth surfaces on the web runtime', () => {
    cy.intercept('GET', '/api/v1/runtime', WEB_RUNTIME).as('runtime');
    cy.visit('/auth/login');
    cy.wait('@runtime');
    cy.get('[data-cy="auth-forgot-password-link"]').should('be.visible');

    cy.visit('/auth/register');
    cy.get('[data-cy="register-athlete-notice"]').should('be.visible');
  });
});
