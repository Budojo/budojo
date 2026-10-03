import { MOCK_ACADEMY } from '../support/fixtures';
import { stubToday } from '../support/today';
import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * Budojo on the phone at the mat (#2035, PRD § 6.1): the app opens on the
 * check-in of the class on the clock, and the register puts the class's
 * regulars first. The runtime is the phone's (intercepted), the clock fixed.
 */

// Thursday 1 October 2026: Gi at 19:00, an hour.
const GI = { id: 7, name: 'Gi', weekday: 4, starts_at: '19:00', duration_minutes: 60, kind: 'gi' };
const athlete = (id: number, first_name: string, last_name: string, belt: string) => ({
  id,
  first_name,
  last_name,
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt,
  stripes: 1,
  status: 'active',
  joined_at: '2025-01-10',
  created_at: '2025-01-10T10:00:00+00:00',
  photo_url: null,
  user_avatar_url: null,
});
const ROOM = [
  athlete(1, 'Anna', 'Bianchi', 'white'),
  athlete(2, 'Bruno', 'Verdi', 'blue'),
  athlete(3, 'Carla', 'Neri', 'purple'),
  athlete(4, 'Dario', 'Rossi', 'white'),
];
const regular = (index: number, attended: number) => ({
  ...ROOM[index],
  is_self: false,
  attended,
  last_attended_on: '2026-09-24',
});

function phoneAt(when: string): void {
  cy.clock(new Date(when).getTime(), ['Date']);
  stubToday();
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: { data: { profile: 'mobile', capabilities: ['sync'] } },
  });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [GI] } });
  cy.intercept('GET', '/api/v1/athletes*', {
    statusCode: 200,
    body: {
      data: ROOM,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 100, to: 4, total: 4 },
    },
  });
  cy.intercept('GET', '/api/v1/attendance?*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/attendance/regulars*', {
    statusCode: 200,
    body: { data: [regular(0, 3), regular(2, 5)], meta: { occurrences: 6, occurrence_dates: [] } },
  });
  cy.intercept('GET', '/api/v1/lessons*', { statusCode: 200, body: { data: null } });
  cy.visitAuthenticated('/dashboard');
}

describe('The phone opens by the clock (#2035)', () => {
  it('on the check-in from 15 minutes before the class', () => {
    phoneAt('2026-10-01T18:50:00');
    cy.location('pathname').should('eq', '/dashboard/attendance');
  });

  it('on the check-in during it', () => {
    phoneAt('2026-10-01T19:30:00');
    cy.location('pathname').should('eq', '/dashboard/attendance');
  });

  it('still on it 20 minutes after it ends', () => {
    phoneAt('2026-10-01T20:20:00');
    cy.location('pathname').should('eq', '/dashboard/attendance');
  });

  it('on Oggi 40 minutes after it ends', () => {
    phoneAt('2026-10-01T20:40:00');
    cy.location('pathname').should('eq', '/dashboard/today');
  });

  it('on Oggi on a day with no class', () => {
    phoneAt('2026-10-02T19:10:00');
    cy.location('pathname').should('eq', '/dashboard/today');
  });

  it('Oggi stays one tap away', () => {
    phoneAt('2026-10-01T19:10:00');
    cy.location('pathname').should('eq', '/dashboard/attendance');
    cy.viewport(390, 844);
    cy.get('[data-cy="topbar-home-link"]').click();
    cy.location('pathname').should('eq', '/dashboard/today');
  });
});

describe('The phone’s register (#2035)', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    phoneAt('2026-10-01T19:05:00');
    cy.get('[data-cy="attendance-mobile-list"]').should('be.visible');
  });

  it('puts the regulars first, the most faithful on top, then everyone else', () => {
    cy.get('[data-cy="attendance-register-regulars"]').should('be.visible');
    cy.get('[data-cy="attendance-mobile-list"] [data-cy^="attendance-card-"]').then((rows) => {
      expect([...rows].map((row) => row.getAttribute('data-cy'))).to.deep.equal([
        'attendance-card-3',
        'attendance-card-1',
        'attendance-card-2',
        'attendance-card-4',
      ]);
    });
  });

  it('marks with a tap and unmarks with a second, and no row moves', () => {
    cy.intercept('POST', '/api/v1/attendance', {
      statusCode: 201,
      body: { data: [{ id: 501, athlete_id: 2, lesson_id: 3, attended_on: '2026-10-01' }] },
    }).as('mark');
    cy.intercept('DELETE', '/api/v1/attendance/501', { statusCode: 204 }).as('unmark');

    cy.get('[data-cy="attendance-card-2"]').click();
    cy.wait('@mark');
    cy.get('[data-cy="attendance-card-2"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-cy="attendance-mobile-list"] [data-cy^="attendance-card-"]')
      .eq(2)
      .should('have.attr', 'data-cy', 'attendance-card-2');

    cy.get('[data-cy="attendance-card-2"]').click();
    cy.wait('@unmark');
    cy.get('[data-cy="attendance-card-2"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-cy="attendance-mobile-list"] [data-cy^="attendance-card-"]')
      .eq(2)
      .should('have.attr', 'data-cy', 'attendance-card-2');
  });

  it('is one list while searching', () => {
    cy.get('[data-cy="attendance-register-regulars"]').should('be.visible');
    cy.get('[data-cy="attendance-search-input"]').type('Car');
    // The search waits out a pause measured on Date, which cy.clock froze: move it on.
    cy.tick(300);
    cy.get('[data-cy="attendance-register-regulars"]').should('not.exist');
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  it(`fits the phone’s register on ${name} with no sideways scroll`, () => {
    cy.viewport(width, height);
    phoneAt('2026-10-01T19:05:00');
    cy.get('[data-cy="attendance-register-regulars"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
