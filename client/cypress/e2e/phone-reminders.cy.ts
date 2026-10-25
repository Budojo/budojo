import { MOCK_ACADEMY } from '../support/fixtures';
import { expectNoSidewaysScroll } from '../support/no-sideways-scroll';
import { stubToday } from '../support/today';
import { VIEWPORT_PHONE } from '../support/viewports';

/**
 * The reminders as Android notifications (#2047, PRD § 6.3). Android's own
 * question about notifications comes only on the owner's tap, after one
 * sentence on Oggi saying why; then the reminders of the next days are handed
 * to Android. The plugin is Capacitor's, stubbed with the answers it gives.
 */

const UNPAID = {
  key: 'unpaid:2026-11',
  at: '2026-11-16T09:00:00+01:00',
  title: 'Un atleta non ha ancora pagato la quota di novembre',
  body: 'Marco Bianchi',
  link: '/dashboard/athletes?paid=no',
};

/** Oggi on the phone, with Android answering `permission` until the owner is asked. */
function openToday(permission: string, afterAsking = 'granted'): void {
  cy.viewport(VIEWPORT_PHONE.width, VIEWPORT_PHONE.height);
  stubToday();
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/reminders/upcoming', {
    statusCode: 200,
    body: { data: [UNPAID] },
  }).as('upcoming');
  let display = permission;
  const plugin = {
    checkPermissions: cy
      .stub()
      .as('check')
      .callsFake(() => Promise.resolve({ display })),
    requestPermissions: cy
      .stub()
      .as('ask')
      .callsFake(() => {
        display = afterAsking;
        return Promise.resolve({ display });
      }),
    createChannel: cy.stub().as('channel').resolves(undefined),
    schedule: cy.stub().as('schedule').resolves({}),
    cancel: cy.stub().as('cancel').resolves(undefined),
    getPending: cy.stub().resolves({ notifications: [] }),
    addListener: cy.stub().resolves({}),
  };
  cy.visitAuthenticated('/dashboard/today', 'fake-token', {
    onBeforeLoad: (win) =>
      Object.assign(win, {
        __BUDOJO_MOBILE__: { apiBase: '' },
        Capacitor: { Plugins: { LocalNotifications: plugin } },
      }),
  });
  cy.get('[data-cy="today"]').should('exist');
}

describe('The reminders on the phone (#2047)', () => {
  it('says why on Oggi, asks Android on the tap, then hands it the reminders', () => {
    openToday('prompt');

    cy.get('[data-cy="today-reminders"]').should(
      'contain.text',
      'Budojo can remind you of certificates, fees and birthdays with the app closed',
    );
    // Nothing asked of Android, nor scheduled, before the owner's yes.
    cy.get('@ask').should('not.have.been.called');
    cy.get('@schedule').should('not.have.been.called');
    expectNoSidewaysScroll();
    cy.get('[data-cy="today-reminders-allow"] button').should(($button) => {
      const box = $button[0].getBoundingClientRect();
      expect(box.width, 'width').to.be.at.least(48);
      expect(box.height, 'height').to.be.at.least(48);
    });

    cy.get('[data-cy="today-reminders-allow"] button').click();

    cy.get('@ask').should('have.been.calledOnce');
    cy.wait('@upcoming');
    cy.get('@channel').should('have.been.calledWithMatch', { id: 'reminders', visibility: 1 });
    cy.get('@schedule')
      .should('have.been.calledOnce')
      .its('firstCall.args.0.notifications')
      .should('have.length', 1)
      .its(0)
      .should('deep.include', {
        title: UNPAID.title,
        body: UNPAID.body,
        channelId: 'reminders',
        isExactNotification: false,
      })
      .its('extra')
      .should('deep.include', { key: UNPAID.key, link: UNPAID.link });
    cy.get('[data-cy="today-reminders"]').should('not.exist');
  });

  it('hands the reminders over on opening once Android has said yes, with no line on Oggi', () => {
    openToday('granted');

    cy.wait('@upcoming');
    cy.get('@schedule').should('have.been.calledOnce');
    cy.get('[data-cy="today-reminders"]').should('not.exist');
  });

  it('offers nothing once the owner has said no: Android would not ask again', () => {
    openToday('denied');

    cy.get('@check').should('have.been.called');
    cy.get('[data-cy="today-reminders"]').should('not.exist');
    cy.get('@schedule').should('not.have.been.called');
  });
});
