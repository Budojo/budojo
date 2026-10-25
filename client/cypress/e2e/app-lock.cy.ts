import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * The fingerprint lock (#2159, PRD § 6.1): on opening, and on coming back
 * after five minutes in the background. The prompt is Android's, so the
 * shell's `AppLock` plugin is stubbed with the answers it gives.
 */

const MARIO = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  is_self: false,
};
const page = {
  data: [MARIO],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
};
const YES = { unlocked: true, secure: true };
const CLOSED = { unlocked: false, secure: true, code: 10, message: 'Cancelled' };

/** What the shell keeps: unlocked since the screen opened, and the longest time away since. */
let shell = { unlocked: false, away: 0 };

/**
 * Opens the athletes on the phone, with the shell answering each prompt in
 * turn, a moment later as a real prompt does. A prompt past the answers given
 * stays up until `answerTheLast` is called. The shell is there on every load,
 * reloads included.
 */
let answerTheLast: (answer: object) => void;
function openWith(...answers: object[]): void {
  cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', /\/api\/v1\/athletes(\?|$)/, { statusCode: 200, body: page }).as('athletes');
  cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  shell = { unlocked: false, away: 0 };
  const state = cy
    .stub()
    .as('state')
    .callsFake(() => Promise.resolve(shell));
  const unlock = cy.stub().as('unlock');
  answers.forEach((answer, call) =>
    unlock
      .onCall(call)
      .callsFake(() => new Promise((resolve) => setTimeout(() => resolve(answer), 300))),
  );
  unlock
    .onCall(answers.length)
    .callsFake(() => new Promise((resolve) => (answerTheLast = resolve)));
  cy.on('window:before:load', (win) =>
    Object.assign(win, { Capacitor: { Plugins: { AppLock: { unlock, state } } } }),
  );
  cy.visitAuthenticated('/dashboard/athletes');
}

function go(state: 'hidden' | 'visible'): void {
  cy.document().then((doc) => {
    Object.defineProperty(doc, 'visibilityState', { value: state, configurable: true });
    doc.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('The fingerprint lock (#2159)', () => {
  it('covers the gym on opening, and asks again from its button after a cancel', () => {
    openWith(CLOSED, YES);
    cy.wait('@athletes');

    cy.get('@unlock').should('have.been.calledOnceWith', { title: 'Unlock Budojo' });
    cy.get('[data-cy="app-lock"]').should('be.visible').and('contain.text', 'Budojo is locked');
    // The gym is under the cover, hidden from the eye and the keyboard alike.
    cy.get('[data-cy="athlete-card-menu-1"]').should('not.be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    // Disabled while the prompt is up; the keyboard starts on it once it closes.
    cy.get('[data-cy="app-lock-unlock"] button')
      .should('not.be.disabled')
      .and('be.focused')
      .and(($button) => expect($button[0].getBoundingClientRect().height).to.be.at.least(48))
      .click();

    cy.get('@unlock').should('have.been.calledTwice');
    cy.get('[data-cy="app-lock"]').should('not.exist');
    cy.get('[data-cy="athlete-card-menu-1"]').should('be.visible');
  });

  it('asks again after five minutes away, and keeps what was being typed', () => {
    openWith(YES);
    cy.get('[data-cy="app-lock"]').should('not.exist');
    cy.get('[data-cy="athletes-search-input"]').type('Mar');

    go('hidden');
    cy.then(() => (shell = { unlocked: true, away: 4 * 60_000 }));
    go('visible');
    cy.get('@state').should('have.been.calledTwice');
    cy.get('[data-cy="app-lock"]').should('not.exist');

    go('hidden');
    cy.then(() => (shell = { unlocked: true, away: 5 * 60_000 }));
    go('visible');
    cy.get('[data-cy="app-lock"]').should('be.visible');
    cy.get('@unlock').should('have.been.calledTwice');
    cy.get('[data-cy="athletes-search-input"]').should('not.be.visible');

    cy.then(() => answerTheLast(YES));
    cy.get('[data-cy="app-lock"]').should('not.exist');
    cy.get('[data-cy="athletes-search-input"]').should('have.value', 'Mar').and('be.visible');
  });

  it('does not ask again when the page reloads after the fingerprint', () => {
    openWith(YES);
    cy.get('[data-cy="app-lock"]').should('not.exist');

    // A sync pull reloads the page; the shell, which outlives it, says it is open.
    cy.then(() => (shell = { unlocked: true, away: 0 }));
    cy.reload();
    cy.wait('@athletes');

    cy.get('[data-cy="athlete-card-menu-1"]').should('be.visible');
    cy.get('[data-cy="app-lock"]').should('not.exist');
    cy.get('@unlock').should('have.been.calledOnce');
  });
});
