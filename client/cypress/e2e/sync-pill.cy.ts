import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';

/**
 * The sync pill and the homecoming card (#2039, #2046, #2125): each state the
 * pill can say, «N da decidere» over a quiet one, and the card Oggi shows
 * when the other device's work arrived. The e2e app runs on the web, where
 * there is no sync, so the spec sets what the pill and the card read through
 * `window.budojoSync` (dev build, inside Cypress only). Every request intercepted.
 */

interface Hook {
  state(state: Record<string, unknown>): void;
  toDecide(count: number): void;
  homecoming(arrived: Record<string, unknown> | null): void;
}

/** Waits for Today to be up, which is when the service that carries the hook exists. */
const hook = (): Cypress.Chainable<Hook> =>
  cy
    .window()
    .should('have.property', 'budojoSync')
    .then((found) => found as unknown as Hook);

const pill = (): Cypress.Chainable<JQuery<HTMLElement>> => cy.get('[data-cy="sync-pill"]:visible');

const LATEST = { device: 'pc4f2a', version: 12 };

const ARRIVED = {
  device: 'phone9c1e',
  at: '2026-10-03T18:47:00+00:00',
  through: '01K6F3Q8Z4M7X2N5P9R1T3V6W8',
  attendance: [{ lesson: 'BJJ Gi', count: 14 }],
  payments: { count: 2, amount_cents: 12000 },
  athletes: 1,
  promotions: 0,
  other: 0,
};

function openToday(): void {
  stubToday();
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.visitAuthenticated('/dashboard/today');
  cy.get('[data-cy="today"]').should('exist');
}

describe('The sync pill (#2046)', () => {
  [
    { name: 'syncing', state: { kind: 'syncing' }, says: 'Syncing with Google Drive…' },
    { name: 'synced', state: { kind: 'synced', at: Date.now() }, says: 'In sync at' },
    {
      name: 'one write to send',
      state: { kind: 'pending', count: 1, offline: false },
      says: '1 to send',
      hint: 'They go at the next try',
    },
    {
      name: 'writes to send, offline',
      state: { kind: 'pending', count: 3, offline: true },
      says: '3 to send',
      hint: 'No network: they go as soon as it is back.',
    },
    {
      name: 'waiting for the PC',
      state: { kind: 'waiting-first' },
      says: 'Waiting for the PC',
      hint: 'The PC has not put the gym on Drive yet',
    },
    {
      name: 'Google let go',
      state: { kind: 'reconnect' },
      says: 'Google signed you out: tap to reconnect',
      hint: 'Google asks again every week',
      attention: true,
      action: 'Reconnect',
    },
    {
      name: 'another folder',
      state: { kind: 'another-folder' },
      says: 'The Drive folder belongs to another gym',
      hint: 'The phone writes nothing there.',
      attention: true,
    },
    {
      name: 'unpaired',
      state: { kind: 'unpaired' },
      says: 'This phone was disconnected from the gym',
      hint: 'Sign out, then sign in with Google',
      attention: true,
    },
    {
      name: 'two devices already',
      state: { kind: 'full' },
      says: 'Budojo is already on two devices',
      hint: 'the sync holds two devices',
      attention: true,
    },
    {
      name: 'failed',
      state: { kind: 'failed', reason: 'Drive answered 500' },
      says: 'The sync did not go through',
      hint: 'Drive answered 500',
      attention: true,
    },
  ].forEach(({ name, state, says, hint, attention, action }) => {
    it(`says it: ${name}`, () => {
      openToday();
      hook().then((sync) => sync.state(state));

      pill().should('have.attr', 'aria-label').and('contain', says);
      pill().should(attention === true ? 'have.class' : 'not.have.class', 'sync-pill--attention');
      pill().click();
      cy.get('[data-cy="sync-detail"]').should('contain.text', says);
      if (hint !== undefined) {
        cy.get('[data-cy="sync-detail-hint"]').should('contain.text', hint);
      }
      cy.get('[data-cy="sync-detail-action"]').should('contain.text', action ?? 'Sync now');
    });
  });

  it('shows nothing where there is no sync', () => {
    openToday();
    hook().then((sync) => sync.state({ kind: 'synced', at: Date.now() }));
    pill().should('be.visible');

    // From a shown pill, so the spec fails if `off` were to keep it.
    hook().then((sync) => sync.state({ kind: 'off' }));
    cy.get('[data-cy="sync-pill"]').should('not.exist');
  });

  it('asks which gym to carry on with, and says what the pick replaces before it confirms', () => {
    openToday();
    hook().then((sync) => sync.state({ kind: 'ask', latest: LATEST, mine: false }));

    pill().click();
    cy.get('[data-cy="sync-detail"]').should('contain.text', 'Drive holds another copy');
    cy.get('[data-cy="sync-ask-folder"]').should('contain.text', 'PC');
    cy.get('[data-cy="sync-ask-device"]').should('be.visible');

    cy.get('[data-cy="sync-ask-folder"]').click();
    cy.get('[data-cy="sync-ask-consequence"]').should('be.visible');
    cy.get('[data-cy="sync-ask-confirm"]').should('be.visible');
    cy.get('[data-cy="sync-ask-cancel"]').click();
    cy.get('[data-cy="sync-ask-folder"]').should('be.visible');
  });

  it('counts what waits to be decided over a quiet state, and leads to the screen', () => {
    cy.intercept('GET', '/api/v1/sync/conflicts', { statusCode: 200, body: { data: [] } });
    openToday();
    hook().then((sync) => {
      sync.state({ kind: 'synced', at: Date.now() });
      sync.toDecide(2);
    });

    pill()
      .should('have.attr', 'aria-label', '2 to decide')
      .and('have.class', 'sync-pill--attention');
    pill().click();
    cy.get('[data-cy="sync-detail-hint"]').should('contain.text', 'you choose which to keep');
    cy.get('[data-cy="sync-detail-decide"]').click();
    cy.location('pathname').should('eq', '/dashboard/sync/decide');
  });

  it('says a single one in the singular, and a lost link over the count', () => {
    openToday();
    hook().then((sync) => {
      sync.state({ kind: 'synced', at: Date.now() });
      sync.toDecide(1);
    });
    pill().should('have.attr', 'aria-label', '1 to decide');

    hook().then((sync) => sync.state({ kind: 'reconnect' }));
    pill().should('have.attr', 'aria-label').and('contain', 'Google signed you out');
  });
});

describe('The homecoming card (#2039)', () => {
  it('says where the work came from and what it brought, and goes once seen', () => {
    cy.intercept('DELETE', '/api/v1/sync/homecoming*', { statusCode: 204 }).as('seen');
    openToday();
    hook().then((sync) => sync.homecoming(ARRIVED));

    cy.get('[data-cy="today-homecoming-title"]').should('contain.text', 'From the phone');
    cy.get('[data-cy="today-homecoming-item"]').should('have.length', 3);
    cy.get('[data-cy="today-homecoming-item"]')
      .eq(0)
      .should('contain.text', '14 attendances in BJJ Gi');
    cy.get('[data-cy="today-homecoming-item"]').eq(1).should('contain.text', '2 payments');
    cy.get('[data-cy="today-homecoming-item"]').eq(2).should('contain.text', '1 new athlete');

    cy.get('[data-cy="today-homecoming-close"]').click();
    cy.wait('@seen').its('request.url').should('contain', `through=${ARRIVED.through}`);
    cy.get('[data-cy="today-homecoming"]').should('not.exist');
  });

  it('names the PC when the PC made the work', () => {
    openToday();
    hook().then((sync) =>
      sync.homecoming({
        ...ARRIVED,
        device: 'pc4f2a',
        attendance: [],
        payments: { count: 0, amount_cents: 0 },
        athletes: 0,
        other: 1,
      }),
    );

    cy.get('[data-cy="today-homecoming-title"]').should('contain.text', 'From the PC');
    cy.get('[data-cy="today-homecoming-item"]')
      .should('have.length', 1)
      .and('contain.text', '1 other change');
  });

  it('shows nothing when nothing arrived', () => {
    openToday();
    hook().then((sync) => sync.homecoming(ARRIVED));
    cy.get('[data-cy="today-homecoming"]').should('be.visible');

    // From a shown card, so the spec fails if `null` were to keep it.
    hook().then((sync) => sync.homecoming(null));
    cy.get('[data-cy="today-homecoming"]').should('not.exist');
  });
});
