import { MOCK_ACADEMY } from '../support/fixtures';

// Today (#1643) — the first screen. Thursday 24 September 2026, 18:30: one
// class tonight at 19:00, nothing tagged on it yet.
const NOW = new Date(2026, 8, 24, 18, 30).getTime();

const PAGE = (data: unknown[], total = data.length) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total },
});

const CLASSES = [
  { id: 1, name: 'Fondamentali', weekday: 4, starts_at: '19:00', duration_minutes: 90, kind: 'gi' },
  { id: 2, name: 'No-gi', weekday: 1, starts_at: '20:00', duration_minutes: 60, kind: 'nogi' },
];

describe('Today, the first screen (#1643)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clock(NOW, ['Date']);
    // Catch-all first, so nothing the shell asks for leaks to the proxy; the
    // specific stubs below are registered later and win.
    // A full page envelope, because the check-in this spec navigates to reads
    // `meta` off its roster request.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: PAGE([]) });
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...MOCK_ACADEMY, monthly_fee_cents: 6000 } },
    }).as('academy');
    // An academy past its first days: the getting-started tour is dismissed,
    // so Today is its cards (the tour itself: onboarding-checklist.cy.ts).
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: { dismissed_at: '2026-09-01T00:00:00Z', completed_steps: [], available_steps: [] },
      },
    });
    cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: CLASSES } });
    // The check-in this spec navigates to asks who usually comes (#1730).
    cy.intercept('GET', '/api/v1/attendance/regulars*', {
      statusCode: 200,
      body: { data: [], meta: { occurrences: 0, occurrence_dates: [] } },
    });
    cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } }).as(
      'lesson',
    );
    cy.intercept('GET', '/api/v1/lessons/suggestions*', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 21,
            name: 'Triangle',
            parent_name: 'Closed guard',
            kind: 'gi',
            reason: 'never',
            last_taught_on: null,
          },
        ],
      },
    }).as('suggestions');
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: {
        data: [{ id: 1, type: 'medical_certificate' }],
        missing_medical_certificate: [],
      },
    });
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/athletes', query: { paid: 'no' } },
      PAGE([], 3),
    );
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/athletes', query: { sort_by: 'joined_at' } },
      PAGE([
        {
          id: 9,
          first_name: 'Francesca',
          last_name: 'Marino',
          belt: 'white',
          stripes: 0,
          status: 'active',
          joined_at: '2026-09-22',
          date_of_birth: null,
        },
      ]),
    );
    cy.intercept('GET', '/api/v1/stats/attendance/daily*', {
      statusCode: 200,
      body: { data: [{ date: '2026-09-22', count: 14 }] },
    });
    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: {
          season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
          kind: null,
          totals: { in_scope: 29, covered: 3, thin: 4, missing: 22, percentage: 10 },
          positions: [],
          missing: [],
          taught: [],
          timeline: [],
        },
      },
    });
  });

  it('opens on Today and answers the evening: tonight, what to check, what to teach, the week', () => {
    cy.visitAuthenticated('/dashboard');
    cy.wait('@academy');
    cy.location('pathname').should('eq', '/dashboard/today');

    cy.get('h1').should('contain.text', 'Thursday 24 September');
    cy.get('[data-cy="today-class-1"]')
      .should('contain.text', '19:00–20:30')
      .and('contain.text', 'Fondamentali')
      .and('contain.text', 'Nothing yet');
    // Monday's class is not tonight's.
    cy.get('[data-cy="today-class-2"]').should('not.exist');

    cy.get('[data-cy="today-watch-certificates"]').should('contain.text', '1');
    cy.get('[data-cy="today-watch-unpaid"]').should('contain.text', 'September fees not paid');

    cy.wait('@suggestions').its('request.query.academy_class_id').should('eq', '1');
    cy.get('[data-cy="today-teach"]').should('contain.text', 'Triangle');

    cy.get('[data-cy="today-week-presences"]').should('contain.text', '14');
    cy.get('[data-cy="today-week-joined"]').should('contain.text', 'Francesca Marino');
  });

  it("opens tonight's lesson sheet from the class, and the check-in from the header", () => {
    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@academy');

    cy.get('[data-cy="today-class-plan-1"] button').click();
    cy.get('[data-cy="lesson-sheet"]').should('be.visible');
    cy.get('[data-cy="lesson-sheet"]').should('contain.text', 'Fondamentali');
    cy.get('body').type('{esc}');

    cy.get('[data-cy="today-checkin"]').click();
    cy.location('pathname').should('eq', '/dashboard/attendance');
  });

  it("names the week's birthdays, today's first, and opens the athlete (#1754)", () => {
    const athlete = (id: number, first: string, last: string, dob: string, phone?: string) => ({
      id,
      first_name: first,
      last_name: last,
      belt: 'blue',
      stripes: 1,
      status: 'active',
      joined_at: '2024-09-01',
      date_of_birth: dob,
      phone_country_code: phone ? '+39' : null,
      phone_national_number: phone ?? null,
    });
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/athletes', query: { birthday: 'week' } },
      PAGE([
        athlete(12, 'Luca', 'Conti', '1995-09-26'),
        athlete(11, 'Sara', 'Neri', '1990-09-24', '3331234567'),
      ]),
    ).as('birthdays');
    cy.intercept('GET', '/api/v1/athletes/11', {
      statusCode: 200,
      body: { data: athlete(11, 'Sara', 'Neri', '1990-09-24') },
    });

    cy.visitAuthenticated('/dashboard/today');
    // For the people training, in the week starting on the owner's own day.
    cy.wait('@birthdays').then(({ request }) => {
      expect(request.query['status']).to.eq('active');
      expect(request.query['from']).to.eq('2026-09-24');
    });

    cy.get('[data-cy^="today-birthday-"]').should('have.length', 2);
    cy.get('[data-cy^="today-birthday-"]')
      .first()
      .should('contain.text', 'Sara Neri')
      .and('contain.text', 'Turns 36 today');
    cy.get('[data-cy="today-birthday-12"]').should('contain.text', 'Sat');

    // The message itself is one tap away (#1869): WhatsApp in a new window,
    // and a row without a number says so instead of lacking the action.
    cy.get('[data-cy="birthday-contact-11-whatsapp"]')
      .should('have.attr', 'href', 'https://wa.me/393331234567')
      .and('have.attr', 'target', '_blank');
    cy.get('[data-cy="birthday-contact-12-none"]').should('be.visible');

    // The detail page opens on its default tab.
    cy.get('[data-cy="today-birthday-11"] a').first().click();
    cy.location('pathname').should('match', /^\/dashboard\/athletes\/11(\/|$)/);
  });

  it('shows no birthdays card on a week without one', () => {
    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@academy');
    cy.get('[data-cy="today-week"]').should('be.visible');
    cy.get('[data-cy="today-birthdays"]').should('not.exist');
  });

  it('goes to the roster filtered to who owes, from the unpaid line', () => {
    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@academy');

    cy.get('[data-cy="today-watch-unpaid"]').click();
    cy.location('pathname').should('eq', '/dashboard/athletes');
    cy.location('search').should('eq', '?paid=no');
  });

  it('before the 16th, counts the unpaid fees with the week, not as something to check (#1753)', () => {
    // Thursday 3 September: same class tonight, but the month is young. The
    // suite's clock is swapped, not moved — a moved clock does not survive the visit.
    cy.clock().then((clock) => clock.restore());
    cy.clock(new Date(2026, 8, 3, 18, 30).getTime(), ['Date']);
    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@academy');

    cy.get('[data-cy="today-week-unpaid"]')
      .should('contain.text', 'September fees not paid yet')
      .and('contain.text', '3');
    cy.get('[data-cy="today-watch-unpaid"]').should('not.exist');

    cy.get('[data-cy="today-week-unpaid"]').click();
    cy.location('pathname').should('eq', '/dashboard/athletes');
    cy.location('search').should('eq', '?paid=no');
  });
});
