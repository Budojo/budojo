import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * A failed load offers a way back (#1499).
 *
 * The notifications page's error branch was a bare `<p>` reading "Couldn't
 * load your notifications. Try again." — naming an action the page did not
 * offer. The reader's only route back was a page reload they had to think of
 * themselves. And the EMPTY branch four lines below it had an icon and a
 * block, so the state that needed help was treated worse than the one that
 * did not: an empty list is a fine terminal state, a failed load is a
 * temporary one that needs exactly one action.
 *
 * The shared `app-error-state` — built in the #1033 adoption pass — has had
 * the icon, the message and a retry slot all along. This page predates the
 * sweep and was never brought in.
 */
function seed() {
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
}

describe('the notifications error state (#1499)', () => {
  it('names the failure and gives the reader an action', () => {
    seed();
    cy.intercept('GET', '/api/v1/me/notifications*', { statusCode: 500, body: {} }).as('failed');
    cy.visitAuthenticated('/dashboard/notifications');
    cy.wait('@failed');

    cy.get('[data-cy="notifications-error"]').should('be.visible');
    // The copy no longer ends by telling you to try again with nothing to try.
    cy.get('[data-cy="notifications-error"]').should('not.contain.text', 'Try again.');
    cy.get('[data-cy="notifications-error"] button').should('be.visible');
  });

  it('retries in place, without a page reload', () => {
    seed();
    cy.intercept('GET', '/api/v1/me/notifications*', { statusCode: 500, body: {} }).as('failed');
    cy.visitAuthenticated('/dashboard/notifications');
    cy.wait('@failed');

    // Wait for the error to actually render before swapping the stub — the
    // request completing and the signal reaching the DOM are two moments.
    cy.get('[data-cy="notifications-error"]').should('be.visible');

    cy.intercept('GET', '/api/v1/me/notifications*', {
      statusCode: 200,
      body: {
        data: [],
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      },
    }).as('recovered');
    cy.get('[data-cy="notifications-error"] button').click();
    cy.wait('@recovered');

    // The property is that pressing it re-asks and clears the error, in
    // place. What renders afterwards — an empty state or a list — is the
    // inbox's business, and asserting it here would be testing the fixture.
    cy.get('[data-cy="notifications-error"]').should('not.exist');
  });
});

describe('the academy reads back what you can set (#1504)', () => {
  const ACADEMY_FULL = {
    statusCode: 200,
    body: {
      data: {
        ...MOCK_ACADEMY,
        training_days: [1, 3, 5],
        season_start_month: 9,
        season_start: '2025-09-01',
        season_label: '2025/26',
      },
    },
  };

  it('shows the training days and the season', () => {
    // Both are settable in the form and neither was readable anywhere. The
    // season is the denominator of a number the owner reads on the roster
    // every day.
    seed();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_FULL);
    cy.visitAuthenticated('/dashboard/academy');

    cy.get('[data-cy="academy-row-training-days"]').should('contain.text', 'Mon');
    cy.get('[data-cy="academy-row-training-days"]').should('contain.text', 'Fri');
    cy.get('[data-cy="academy-row-season"]').should('contain.text', '2025/26');
    // The start date in words, so "what is it counting" is checkable.
    cy.get('[data-cy="academy-row-season"]').should('contain.text', '1 September 2025');
  });

  it('says nothing rather than something wrong when neither is set', () => {
    seed();
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...MOCK_ACADEMY, training_days: null } },
    });
    cy.visitAuthenticated('/dashboard/academy');

    cy.get('[data-cy="academy-row-training-days"]').should('contain.text', '—');
  });
});
