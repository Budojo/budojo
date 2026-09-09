import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * The training year (#1484).
 *
 * The roster's lower number used to count an athlete's whole history with the
 * gym. That answers a question about the gym: two athletes who joined five
 * years apart are not comparable on it, and an instructor asking "how is this
 * season going" gets a number spanning three of them.
 *
 * It counts the season now, and the tooltip is what makes that legible — the
 * cell has room for a fraction and nothing else, so the window it covers has
 * to be said somewhere. These are hover tests because that is the only way to
 * find out whether it actually opens: the wording can be right in the
 * component and never reach a screen.
 */
const ACADEMY_WITH_SEASON = {
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

/**
 * The onboarding probe fires on every dashboard load, and an unhandled 401 on
 * it logs the session out mid-test — the roster is replaced by the login page
 * a beat after it renders, and the failure reads as a missing element rather
 * than as a redirect. Answered as "already dismissed" so the checklist does
 * not cover the table either.
 */
const ONBOARDING_DISMISSED = {
  statusCode: 200,
  body: {
    data: {
      dismissed_at: '2026-01-01T00:00:00+00:00',
      completed_steps: [],
      available_steps: [],
    },
  },
};

function roster(joinedAt: string) {
  return {
    statusCode: 200,
    body: {
      data: [
        {
          id: 1,
          first_name: 'Mario',
          last_name: 'Rossi',
          email: null,
          phone_country_code: null,
          phone_national_number: null,
          address: null,
          date_of_birth: '1990-05-15',
          belt: 'brown',
          stripes: 2,
          status: 'active',
          joined_at: joinedAt,
          created_at: '2026-04-22T10:00:00+00:00',
          attendance_month_count: 6,
          attendance_total_count: 41,
        },
      ],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
    },
  };
}

describe('the roster counts a season, not a membership (#1484)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_WITH_SEASON).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/attendance/summary*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/onboarding', ONBOARDING_DISMISSED);
  });

  it('names the season on the lower line', () => {
    // A veteran of three years. Their number covers this season only, and
    // without the tooltip nothing on the screen says which one.
    cy.intercept('GET', '/api/v1/athletes*', roster('2023-01-10')).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('.athlete-attendance__total').first().trigger('mouseenter');
    cy.get('.p-tooltip').should('be.visible').and('contain.text', '2025/26');
  });

  it('explains the shorter window for someone who joined mid-season', () => {
    // The half the feedback asked for by name. Without it a February arrival
    // reads as an athlete who misses most sessions, when the truth is that
    // most of the season happened before they existed.
    cy.intercept('GET', '/api/v1/athletes*', roster('2026-02-03')).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('.athlete-attendance__total').first().trigger('mouseenter');
    cy.get('.p-tooltip')
      .should('be.visible')
      .and('contain.text', '2025/26')
      // The joining day spelled out, not merely implied by a smaller number.
      .and('contain.text', '2026');
  });

  it('says only "this month" on the upper line', () => {
    // The two lines are distinguished by stacking alone, so each has to name
    // its own window.
    cy.intercept('GET', '/api/v1/athletes*', roster('2023-01-10')).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@athletes');

    cy.get('.athlete-attendance__month').first().trigger('mouseenter');
    cy.get('.p-tooltip').should('be.visible').and('contain.text', 'This month');
  });
});

describe('the owner chooses when the year restarts (#1484)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_WITH_SEASON).as('academy');
    cy.intercept('GET', '/api/v1/academy/fee-tiers*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/onboarding', ONBOARDING_DISMISSED);
  });

  it('shows the saved month and sends a new one on the wire', () => {
    cy.intercept('PATCH', '/api/v1/academy', ACADEMY_WITH_SEASON).as('save');
    cy.visitAuthenticated('/dashboard/academy/edit');
    cy.wait('@academy');

    // September is what the fixture stores, so it is what the control shows —
    // a settings field that does not reflect the setting is worse than none.
    cy.get('[data-cy="academy-form-season-start-month"]').should('contain.text', 'September');

    cy.get('[data-cy="academy-form-season-start-month"]').click();
    cy.get('.p-select-option').contains('January').click();
    cy.get('[data-cy="academy-form-save"]').click();

    cy.wait('@save').its('request.body.season_start_month').should('eq', 1);
  });
});
