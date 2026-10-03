import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';
import { stubToday } from '../support/today';

/**
 * «Da decidere» (#2038, PRD § 6.4): the writes a rebase set aside, each a
 * question the owner answers. Every request intercepted: the list, the retry
 * that makes the phone's write true here, and the answer.
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

  it('keeps the phone’s after a confirm: the retry goes through the API, then the answer', () => {
    cy.intercept('PATCH', '/api/v1/athletes/57', {
      statusCode: 200,
      body: { data: { id: 57 } },
    }).as('retry');
    cy.intercept('POST', `/api/v1/sync/conflicts/${NAME.id}/decision`, { statusCode: 204 }).as(
      'decide',
    );
    cy.visitAuthenticated('/dashboard/sync/decide');
    cy.wait('@list');

    cy.get('[data-cy="sync-decide-item"]').first().find('[data-cy="sync-decide-mine"]').click();
    cy.contains("The phone's takes the place of the PC's.");
    cy.get('.p-confirmpopup').contains('button', "Keep the phone's").click();

    cy.wait('@retry').its('request.body').should('deep.equal', { last_name: 'Bianco' });
    cy.wait('@decide').its('request.body').should('deep.equal', { decision: 'mine' });
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
});
