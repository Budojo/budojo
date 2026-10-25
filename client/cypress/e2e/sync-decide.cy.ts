import { MOCK_ACADEMY } from '../support/fixtures';
import {
  MOBILE_VIEWPORTS,
  VIEWPORT_LAPTOP,
  VIEWPORT_MIN_WINDOW,
  VIEWPORT_PHONE,
} from '../support/viewports';
import { stubToday } from '../support/today';

/**
 * «Da decidere» (#2038, PRD § 6.4): the writes a rebase set aside, each a
 * question the owner answers. Every request intercepted: the list, the retry
 * that makes the phone's write true here, and the answer. Every kind of
 * conflict (#2031) is shown at the desktop window's widths and the phone's,
 * in both themes (#2125).
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const LUCA = {
  id: 57,
  name: 'Luca Bianchi',
  first_name: 'Luca',
  last_name: 'Bianchi',
  belt: 'blue',
  stripes: 2,
  date_of_birth: null,
  photo_url: null,
  user_avatar_url: null,
};
const NAME = {
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6W8',
  device: 'phone9c1e',
  route: 'athletes.update',
  reason: 'changed',
  detail: {
    reason: 'changed',
    table: 'athletes',
    id: '57',
    field: 'last_name',
    saw: 'Bianchi',
    here: 'Verdi',
  },
  entry: { method: 'PATCH', params: { athlete: 57 }, body: { last_name: 'Bianco' }, before: null },
  recorded_at: '2026-10-03T18:32:05+00:00',
  subject: { athlete: LUCA, others: 0 },
  retry: [{ method: 'PATCH', url: '/api/v1/athletes/57', body: { last_name: 'Bianco' } }],
};
const OCTOBER = {
  ...NAME,
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6W9',
  route: 'athletes.payments.store',
  reason: 'differs',
  detail: { reason: 'differs', field: 'payment_method', mine: 'cash', here: 'pos' },
  entry: {
    method: 'POST',
    params: { athlete: 57 },
    body: { year: 2026, month: 10, payment_method: 'cash' },
    before: null,
  },
  retry: null,
};
const GONE = {
  ...NAME,
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6WA',
  reason: 'gone',
  detail: { reason: 'gone', message: null },
  retry: null,
};
const REFUSED = {
  ...NAME,
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6WB',
  route: 'athletes.promotions.store',
  reason: 'refused',
  detail: { reason: 'refused', message: 'The belt cannot go backwards.' },
  entry: { method: 'POST', params: { athlete: 57 }, body: { belt: 'white' }, before: null },
};
const UNKNOWN = {
  ...NAME,
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6WC',
  route: 'future.thing.store',
  reason: 'unknown-route',
  detail: { reason: 'unknown-route' },
  subject: null,
  retry: null,
};
const FAILED = {
  ...NAME,
  id: '01K6F3Q8Z4M7X2N5P9R1T3V6WD',
  route: 'academy.update',
  reason: 'failed',
  detail: { reason: 'failed', message: 'Server error' },
  entry: { method: 'PATCH', params: {}, body: { name: 'Eagles BJJ' }, before: null },
  subject: null,
  retry: [{ method: 'PATCH', url: '/api/v1/academy', body: { name: 'Eagles BJJ' } }],
};
const EVERY_KIND = [NAME, OCTOBER, GONE, REFUSED, UNKNOWN, FAILED];

describe('«Da decidere» (#2038)', () => {
  beforeEach(() => {
    stubToday();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/sync/conflicts', {
      statusCode: 200,
      body: { data: [NAME, OCTOBER] },
    }).as('list');
  });

  it('shows each question with both sides, and keeps the PC’s with one tap', () => {
    cy.intercept('POST', `/api/v1/sync/conflicts/${OCTOBER.id}/decision`, { statusCode: 204 }).as(
      'decide',
    );
    cy.visitAuthenticated('/dashboard/sync/decide');
    cy.wait('@list');

    cy.get('[data-cy="sync-decide-item"]').should('have.length', 2);
    cy.get('[data-cy="sync-decide-item"]')
      .first()
      .within(() => {
        cy.contains('Athlete details');
        cy.contains('Last name · On the phone').parent().should('contain.text', 'Bianco');
        cy.contains('Last name · On the PC').parent().should('contain.text', 'Verdi');
      });
    cy.get('[data-cy="sync-decide-item"]')
      .eq(1)
      .within(() => {
        cy.contains('Payment for October 2026');
        cy.get('[data-cy="sync-decide-mine"]').should('not.exist');
        cy.get('[data-cy="sync-decide-theirs"]').click();
      });

    cy.wait('@decide').its('request.body').should('deep.equal', { decision: 'theirs' });
    cy.get('[data-cy="sync-decide-item"]').should('have.length', 1);
  });

  it('keeps the phone’s after a confirm: one call, the write and the answer together', () => {
    cy.intercept('POST', `/api/v1/sync/conflicts/${NAME.id}/keep-mine`, { statusCode: 204 }).as(
      'keep',
    );
    cy.visitAuthenticated('/dashboard/sync/decide');
    cy.wait('@list');

    cy.get('[data-cy="sync-decide-item"]').first().find('[data-cy="sync-decide-mine"]').click();
    cy.contains("The phone's takes the place of the PC's.");
    cy.get('.p-confirmpopup').contains('button', "Keep the phone's").click();

    cy.wait('@keep');
    cy.get('[data-cy="sync-decide-item"]').should('have.length', 1);
  });

  it('says there is nothing to decide once nothing waits', () => {
    cy.intercept('GET', '/api/v1/sync/conflicts', { statusCode: 200, body: { data: [] } }).as(
      'empty',
    );
    cy.visitAuthenticated('/dashboard/sync/decide');
    cy.wait('@empty');

    cy.get('[data-cy="sync-decide-empty"]').should('contain.text', 'Nothing to decide');
  });

  MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
    it(`stays one column with no sideways scroll on ${name}`, () => {
      cy.viewport(width, height);
      cy.visitAuthenticated('/dashboard/sync/decide');
      cy.wait('@list');

      cy.get('[data-cy="sync-decide-item"]').should('have.length', 2);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(width);
      });
    });
  });

  const WIDTHS = [VIEWPORT_LAPTOP, VIEWPORT_MIN_WINDOW, VIEWPORT_PHONE];
  (['light', 'dark'] as const).forEach((theme) => {
    WIDTHS.forEach(({ name, width, height }) => {
      it(`shows every kind of conflict at ${name} (${width}px), ${theme} theme`, () => {
        cy.intercept('GET', '/api/v1/sync/conflicts', {
          statusCode: 200,
          body: { data: EVERY_KIND },
        }).as('every');
        cy.viewport(width, height);
        cy.visitAuthenticated('/dashboard/sync/decide', undefined, {
          onBeforeLoad: (win) => win.localStorage.setItem('budojoTheme', theme),
        });
        cy.wait('@every');
        cy.get('html').should(theme === 'dark' ? 'have.class' : 'not.have.class', 'dark');

        const items = (): Cypress.Chainable<JQuery<HTMLElement>> =>
          cy.get('[data-cy="sync-decide-item"]');
        items().should('have.length', 6);
        const kinds = [
          'Changed on both',
          'Recorded in two different ways',
          'Gone on the other device',
          'Not accepted here',
          'This version of Budojo does not know it',
          'Did not go through here',
        ];
        kinds.forEach((reason, index) => {
          items().eq(index).should('contain.text', reason);
        });

        // Both sides only where there is a field to compare: changed and differs.
        [0, 1].forEach((index) => {
          items().eq(index).find('[data-cy="sync-decide-sides"]').should('have.length', 1);
        });
        [2, 3, 4, 5].forEach((index) => {
          items().eq(index).find('[data-cy="sync-decide-sides"]').should('not.exist');
        });
        // «Keep the phone's» only where a retry can make it true here.
        items().eq(0).find('[data-cy="sync-decide-mine"]').scrollIntoView().should('be.visible');
        [1, 2, 4].forEach((index) => {
          items().eq(index).find('[data-cy="sync-decide-mine"]').should('not.exist');
          items().eq(index).should('contain.text', 'cannot be put back from here');
        });
        items().eq(3).find('[data-cy="sync-decide-mine"]').scrollIntoView().should('be.visible');
        items().eq(5).find('[data-cy="sync-decide-mine"]').scrollIntoView().should('be.visible');
        items().eq(4).should('contain.text', 'A change');
        items().eq(5).should('contain.text', 'Gym details');

        // Every answer reachable, and nothing wider than the screen.
        cy.get('[data-cy="sync-decide-theirs"]').each(($button) => {
          cy.wrap($button).scrollIntoView().should('be.visible');
        });
        // The shell scrolls `main`, not the document, from 768px up: a wide
        // card would scroll it sideways and leave the document's width alone.
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.at.most(width);
        });
        cy.get('main.main').should(($main) => {
          expect($main[0].scrollWidth).to.be.at.most($main[0].clientWidth);
        });
      });
    });
  });
});
