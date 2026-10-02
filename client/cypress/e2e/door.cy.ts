import { MOCK_ACADEMY_RESPONSE } from '../support/fixtures';
import { stubToday } from '../support/today';
import { VIEWPORT_PIXEL_8_PRO } from '../support/viewports';

/**
 * The phone's door (#2079, PRD § 5.4): «Accedi con Google», and the gym the PC
 * put on Google Drive comes back by itself. The phone's shell is stubbed, as
 * the Android app's plugins; Drive and the phone's own server are intercepted.
 */

const OWNER = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: null,
  email: 'owner@pc.test',
  role: 'owner' as const,
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
  pending_email_change: null,
};

const KAIZEN = {
  name: 'Kaizen',
  athletes: 42,
  belts: { white: 20, blue: 12, purple: 6, brown: 3, black: 1 },
};
const PROVA = { name: 'Prova', athletes: 2, belts: { white: 2 } };

interface Stubs {
  restart: ReturnType<typeof cy.stub>;
  authorize: ReturnType<typeof cy.stub>;
}

/** The Android app's plugins, as `PhpServerPlugin` and `DriveAuthPlugin` answer. */
function asThePhone(win: Window, stubs: Stubs): void {
  const capacitor = {
    Plugins: {
      PhpServer: {
        start: () => Promise.resolve({ port: 41234, shellSecret: 'from-the-shell' }),
        restart: stubs.restart,
      },
      DriveAuth: { authorize: stubs.authorize, clearToken: () => Promise.resolve() },
    },
  };
  // What `main.ts` publishes once the phone's server has started: the web
  // build under test never starts one, so it is set here.
  Object.assign(win, {
    Capacitor: capacitor,
    __BUDOJO_MOBILE__: { apiBase: '', shellSecret: 'from-the-shell' },
  });
  win.localStorage.setItem('budojoLang', 'en');
}

function visitTheDoor(here: typeof PROVA | null): Stubs {
  const stubs: Stubs = {
    restart: cy.stub().resolves({ port: 41234, shellSecret: 'from-the-shell' }).as('restart'),
    authorize: cy.stub().resolves({ accessToken: 'google-token' }).as('authorize'),
  };
  cy.intercept('GET', 'https://www.googleapis.com/drive/v3/about*', {
    body: { user: { emailAddress: 'mario@gmail.com' } },
  });
  cy.intercept('GET', 'https://www.googleapis.com/drive/v3/files?*', (req) => {
    const query = String(req.query['q'] ?? '');
    req.reply({
      body: query.includes('vnd.google-apps.folder')
        ? { files: [{ id: 'budojo-folder' }] }
        : { files: [{ id: 'b1', name: 'budojo-backup-20261001-165132.zip' }] },
    });
  });
  cy.intercept('GET', 'https://www.googleapis.com/drive/v3/files/b1?alt=media', {
    body: 'PK the archive',
    headers: { 'content-type': 'application/zip' },
  }).as('download');
  cy.intercept('POST', '/api/v1/device/backup/inspect', {
    body: {
      data: {
        backup: { taken_at: '2026-10-01T16:51:32.000Z', app_version: '2.74.1', academy: KAIZEN },
        here,
      },
    },
  }).as('inspectBackup');
  cy.intercept('POST', '/api/v1/device/backup/restore', { statusCode: 204 }).as('restore');
  cy.intercept('POST', '/api/v1/device/session', {
    body: { token: 'owner-token', data: OWNER },
  }).as('session');
  // Where the session lands: the dashboard, signed in.
  cy.intercept('GET', '/api/v1/**', {
    body: { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 } },
  });
  cy.intercept('GET', '/api/v1/auth/me', { body: { data: OWNER } });
  cy.intercept('GET', '/api/v1/academy', MOCK_ACADEMY_RESPONSE);
  // The phone's profile, as its server answers: no cookie banner there (#1508).
  cy.intercept('GET', '/api/v1/runtime', {
    body: { data: { profile: 'mobile', capabilities: ['sync'] } },
  });
  stubToday();
  cy.viewport(VIEWPORT_PIXEL_8_PRO.width, VIEWPORT_PIXEL_8_PRO.height);
  cy.visit('/', { onBeforeLoad: (win) => asThePhone(win, stubs) });
  return stubs;
}

describe('the door on the phone (#2079)', () => {
  it('opens on «Sign in with Google»', () => {
    visitTheDoor(null);

    cy.get('[data-cy="door-google"]')
      .should('be.visible')
      .and('contain.text', 'Sign in with Google');
    cy.get('[data-cy="door-without-google"]').should('be.visible');
  });

  it("brings the PC's backup back by itself on a phone that holds no gym, then signs in", () => {
    visitTheDoor(null);

    cy.get('[data-cy="door-google"]').click();

    cy.wait('@download');
    cy.wait('@inspectBackup')
      .its('request.headers')
      .should('include', { 'x-budojo-shell': 'from-the-shell' });
    cy.wait('@restore');
    cy.get('@restart').should('have.been.calledOnce');
    cy.wait('@session');
    cy.location('pathname').should('match', /^\/dashboard/);
  });

  it('names both gyms and waits for the owner when the phone holds one', () => {
    visitTheDoor(PROVA);

    cy.get('[data-cy="door-google"]').click();

    cy.get('[data-cy="door-academy-drive"]')
      .should('contain.text', 'Kaizen')
      .and('contain.text', '42 active athletes');
    cy.get('[data-cy="door-academy-here"]').should('contain.text', 'Prova');
    cy.get('[data-cy="door-use-drive"]').should('be.visible');
    cy.get('[data-cy="door-keep-here"]').should('be.visible');
    cy.get('@restart').should('not.have.been.called');
    cy.screenshot('door-choose', { capture: 'viewport' });
  });

  it("goes in on the phone's own gym when the owner keeps it, and restores nothing", () => {
    visitTheDoor(PROVA);
    cy.get('[data-cy="door-google"]').click();

    cy.get('[data-cy="door-keep-here"]').click();

    cy.wait('@session');
    cy.location('pathname').should('match', /^\/dashboard/);
    cy.get('@restart').should('not.have.been.called');
  });

  it('is where signing out lands', () => {
    visitTheDoor(null);
    cy.visit('/auth/login', {
      onBeforeLoad: (win) => asThePhone(win, { restart: cy.stub(), authorize: cy.stub() }),
    });

    cy.location('pathname').should('eq', '/');
    cy.get('[data-cy="door-google"]').should('be.visible');
  });
});

describe('outside the phone', () => {
  it('keeps the welcome and the sign-in', () => {
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem('budojoLang', 'en') });

    cy.get('[data-cy="door-google"]').should('not.exist');
    cy.visit('/auth/login');
    cy.get('input[id="email"]').should('be.visible');
  });
});
