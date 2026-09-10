import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * One date format, and it follows the language (#1498).
 *
 * The app shipped two hardcoded picker formats — `dd/mm/yy` in six templates
 * and `yy-mm-dd` in five — so an owner editing an athlete's joining date saw
 * `2024-09-01` and recording that athlete's belt on the next tab saw
 * `01/09/2024`. Same person, same session. And neither followed the sidebar
 * language: switching to Italian changed every word on the page and not one
 * date.
 *
 * Two display dates had the same problem from the other side: the athlete's
 * "Joined" line and the leaderboard's period label rendered the API's ISO
 * strings straight through.
 */
const ATHLETE = {
  id: 1,
  first_name: 'Isabella',
  last_name: 'Conciarelli',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: '1995-03-12',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2024-09-01',
  created_at: '2024-09-01T10:00:00+00:00',
  website: null,
  facebook: null,
  instagram: null,
  billing_period_months: 1,
  fee_tier_id: null,
  is_self: false,
};

function seed(lang: 'en' | 'it') {
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } });
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
  cy.visitAuthenticated('/dashboard/athletes/1/edit', undefined, {
    onBeforeLoad: (w) => w.localStorage.setItem('budojoLang', lang),
  });
}

describe('dates a person reads (#1498)', () => {
  it('writes the joining date in words, not as a wire format', () => {
    seed('en');

    // `Joined 2024-09-01` is what this said before.
    cy.get('.athlete-detail-page__meta').should('contain.text', '1 September 2024');
    cy.get('.athlete-detail-page__meta').should('not.contain.text', '2024-09-01');
  });

  it('writes it in Italian when the app is in Italian', () => {
    seed('it');

    cy.get('.athlete-detail-page__meta').should('contain.text', '1 settembre 2024');
  });

  it('gives the pickers a day-first format, never the machine one', () => {
    // The form is on the same page, below the tabs.
    seed('en');

    cy.get('#joined_at').should('have.value', '01/09/2024');
    cy.get('#date_of_birth').should('have.value', '12/03/1995');
  });

  it('uses the same format in both languages, so a date never changes shape', () => {
    seed('it');

    cy.get('#joined_at').should('have.value', '01/09/2024');
  });
});
