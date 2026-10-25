import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * The update notice on the phone (#2041, PRD § 5.5): Oggi reads the latest
 * GitHub release once per launch and, when its APK is newer than the app, a
 * quiet line offers the download. The e2e app is a dev build: it runs as a
 * release through `window.budojoVersion`, inside Cypress only.
 */

const RELEASES = 'https://api.github.com/repos/Budojo/budojo/releases?per_page=10';
const APK = 'https://github.com/Budojo/budojo/releases/download/v2.80.0/Budojo-Android-2.80.0.apk';

function openTodayOnThePhone(running: string): void {
  cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
  stubToday();
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.visitAuthenticated('/dashboard/today', 'fake-token', {
    onBeforeLoad: (win) =>
      Object.assign(win, { __BUDOJO_MOBILE__: { apiBase: '' }, budojoVersion: running }),
  });
  cy.get('[data-cy="today"]').should('exist');
}

describe('The update notice on the phone (#2041)', () => {
  it('offers the newer APK as a quiet line on Oggi, a link the thumb can press', () => {
    cy.intercept('GET', RELEASES, {
      body: [
        {
          tag_name: 'v2.80.0',
          prerelease: false,
          assets: [
            { name: 'Budojo-Setup-2.80.0.exe', browser_download_url: 'https://github.com/x.exe' },
            { name: 'Budojo-Android-2.80.0.apk', browser_download_url: APK },
          ],
        },
      ],
    }).as('latest');
    openTodayOnThePhone('2.79.0');
    cy.wait('@latest');

    cy.get('[data-cy="today-update"]').should('contain.text', 'Budojo 2.80.0 is out');
    cy.get('[data-cy="today-update-download"]')
      .should('have.attr', 'href', APK)
      .and(($link) => expect($link[0].getBoundingClientRect().height).to.be.at.least(48));
  });

  it('says nothing when the phone already runs the latest', () => {
    cy.intercept('GET', RELEASES, {
      body: [
        {
          tag_name: 'v2.79.0',
          prerelease: false,
          assets: [{ name: 'Budojo-Android-2.79.0.apk', browser_download_url: APK }],
        },
      ],
    }).as('latest');
    openTodayOnThePhone('2.79.0');
    cy.wait('@latest');

    cy.get('[data-cy="today-update"]').should('not.exist');
  });

  it('stays on Oggi, quiet, when GitHub cannot be reached', () => {
    cy.intercept('GET', RELEASES, { forceNetworkError: true }).as('latest');
    openTodayOnThePhone('2.79.0');
    cy.wait('@latest');

    // A failed check is no reason for the offline page.
    cy.location('pathname').should('eq', '/dashboard/today');
    cy.get('[data-cy="today-update"]').should('not.exist');
  });

  it('asks nothing from a test build, which no release installs over', () => {
    cy.intercept('GET', RELEASES, cy.spy().as('asked'));
    openTodayOnThePhone('0.0.231');

    cy.get('[data-cy="today-checkin"], [data-cy="today-tonight"]').should('exist');
    cy.get('@asked').should('not.have.been.called');
  });
});
