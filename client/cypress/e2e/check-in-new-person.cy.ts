import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';
import { VIEWPORT_LAPTOP, VIEWPORT_PHONE } from '../support/viewports';

/**
 * Someone new at the door (#1939, #2045, PRD § 6.1): from the check-in, a
 * person in three fields, already marked present in the class on screen, and
 * the rest of their record a tap away. On the PC and on the phone.
 */

// Thursday 1 October 2026: Gi at 19:00, an hour.
const GI = { id: 7, name: 'Gi', weekday: 4, starts_at: '19:00', duration_minutes: 60, kind: 'gi' };
const person = (id: number, first_name: string, last_name: string) => ({
  id,
  first_name,
  last_name,
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt: 'white',
  stripes: 0,
  status: 'active',
  joined_at: '2026-10-01',
  created_at: '2026-10-01T17:05:00+00:00',
  photo_url: null,
  user_avatar_url: null,
  is_self: false,
  monthly_fee_cents: 0,
  payment_coverage: 'none',
});
const ANNA = person(1, 'Anna', 'Bianchi');
const LUCA = person(31, 'Luca', 'Bianchi');
const page = (data: unknown[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 200, to: 1, total: 1 },
});

function atClass(viewport: { width: number; height: number }, profile: 'mobile' | 'web'): void {
  cy.viewport(viewport.width, viewport.height);
  cy.clock(new Date('2026-10-01T19:05:00').getTime(), ['Date']);
  stubToday();
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: { data: { profile, capabilities: profile === 'mobile' ? ['sync'] : [] } },
  });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [GI] } });
  // The roster answers by what is searched: Luca is there once he is added.
  cy.intercept('GET', '/api/v1/athletes*', (req) => {
    const q = String(req.query['q'] ?? '');
    req.reply({ statusCode: 200, body: page(q.startsWith('Luca') ? [] : [ANNA]) });
  }).as('roster');
  cy.intercept('GET', '/api/v1/attendance?*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/attendance/regulars*', {
    statusCode: 200,
    body: { data: [], meta: { occurrences: 0, occurrence_dates: [] } },
  });
  cy.intercept('GET', '/api/v1/lessons*', { statusCode: 200, body: { data: null } });
  cy.intercept('GET', '/api/v1/stats/payments/arrears', { statusCode: 200, body: { data: [] } });
  cy.visitAuthenticated('/dashboard/attendance');
  cy.wait('@roster');
  cy.get('[data-cy="attendance-search-input"]').should('be.visible');
}

function addLuca(): void {
  cy.intercept('POST', '/api/v1/athletes', { statusCode: 201, body: { data: LUCA } }).as('create');
  // From now on the search finds him.
  cy.intercept('GET', '/api/v1/athletes*', { statusCode: 200, body: page([LUCA]) });
}

describe('Someone new at the door (#1939)', () => {
  it('is added from an empty search and marked present, on the PC', () => {
    atClass(VIEWPORT_LAPTOP, 'web');
    // Enter applies the search at once: the frozen clock never ends its pause.
    cy.get('[data-cy="attendance-search-input"]').type('Luca Bianchi{enter}');
    cy.get('[data-cy="attendance-add-named"]:visible')
      .should('contain.text', 'Add «Luca Bianchi» and mark present')
      .click();

    cy.get('[data-cy="new-person-first"]').should('have.value', 'Luca');
    cy.get('[data-cy="new-person-last"]').should('have.value', 'Bianchi');
    addLuca();
    cy.intercept('POST', '/api/v1/attendance', {
      statusCode: 201,
      body: { data: [{ id: 900, athlete_id: 31, lesson_id: 3, attended_on: '2026-10-01' }] },
    }).as('mark');
    cy.get('[data-cy="new-person-submit"] button').click();

    cy.wait('@create').its('request.body').should('deep.equal', {
      first_name: 'Luca',
      last_name: 'Bianchi',
      belt: 'white',
      stripes: 0,
      status: 'active',
      joined_at: '2026-10-01',
      fee_override_cents: 0,
    });
    cy.wait('@mark')
      .its('request.body')
      .should('deep.include', { athlete_ids: [31], academy_class_id: 7 });

    cy.get('[data-cy="attendance-row-31"]').should('have.attr', 'aria-pressed', 'true');
    cy.contains('New person: Luca Bianchi, marked present').should('be.visible');
    cy.get('[data-cy="attendance-complete-record"]')
      .should('have.attr', 'href', '/dashboard/athletes/31/edit')
      .and(($a) => expect($a[0].getBoundingClientRect().height).to.be.at.least(48));
  });

  it('opens empty from the button on the phone, and asks for both names', () => {
    atClass(VIEWPORT_PHONE, 'mobile');
    cy.get('[data-cy="attendance-add-person"]').should('be.visible').click();

    cy.get('[data-cy="new-person-first"]').should('have.value', '');
    cy.get('[data-cy="new-person-submit"] button').click();
    cy.contains('First name is required').should('be.visible');
    cy.contains('Last name is required').should('be.visible');

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    // Cancelling creates nobody.
    cy.get('body').type('{esc}');
    cy.get('.p-dialog').should('not.exist');
  });

  it('keeps the person when the presence does not go through, and says so', () => {
    atClass(VIEWPORT_PHONE, 'mobile');
    // Enter applies the search at once: the frozen clock never ends its pause.
    cy.get('[data-cy="attendance-search-input"]').type('Luca Bianchi{enter}');
    cy.get('[data-cy="attendance-add-named"]:visible').click();
    addLuca();
    cy.intercept('POST', '/api/v1/attendance', { statusCode: 500, body: { message: 'x' } }).as(
      'mark',
    );
    cy.get('[data-cy="new-person-submit"] button').click();
    cy.wait('@create');
    cy.wait('@mark');

    cy.contains("New person: Luca Bianchi. The presence didn't go through").should('be.visible');
    cy.get('[data-cy="attendance-card-31"]').should('have.attr', 'aria-pressed', 'false');
  });
});
