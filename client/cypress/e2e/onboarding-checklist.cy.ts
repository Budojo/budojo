import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * First-run "Getting started" checklist E2E (#424), on Today since #1755.
 *
 *  1. A fresh owner with nothing yet lands on Today from `/dashboard` and
 *     sees the checklist — and nothing else: no card heading over an empty
 *     card.
 *  2. Clicking a step CTA → navigation fires + complete-step POSTs.
 *  3. An owner with a timetable and athletes sees the checklist above the
 *     cards, which say what they have.
 *  4. Already-dismissed owner → the checklist does NOT render.
 *
 * The interactive dismiss flow (CTA → confirm-popup → POST → checklist
 * hides) is covered by the component-level unit specs; keeping the cypress
 * shard tight here.
 */

// Thursday 24 September 2026, 18:30.
const NOW = new Date(2026, 8, 24, 18, 30).getTime();

const FAKE_USER = {
  id: 1,
  first_name: 'Tester',
  last_name: 'McTest',
  full_name: 'Tester McTest',
  handle: null,
  email: 'tester@example.com',
  role: 'owner' as const,
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
  pending_email_change: null,
};

const FRESH_STATE = {
  dismissed_at: null,
  completed_steps: [],
  available_steps: [
    'add_athlete',
    'log_attendance',
    'mark_payment',
    'upload_document',
    'view_stats',
  ],
};

const PAGE = (data: unknown[], total = data.length) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total },
});

const CARDS = ['today-tonight', 'today-watch', 'today-teach', 'today-week', 'today-birthdays'];

describe('First-run onboarding checklist (#424, on Today since #1755)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clock(NOW, ['Date']);
    // Catch-all first, so nothing Today asks for leaks to the proxy: an
    // academy with nothing in it answers every list with an empty page.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: PAGE([]) });
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [], missing_medical_certificate: [] },
    });
    cy.intercept('GET', '/api/v1/stats/attendance/daily*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: {
          season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
          kind: null,
          totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
          positions: [],
          missing: [],
          taught: [],
        },
      },
    });
  });

  it('lands a brand-new academy on Today, where the checklist is the whole page', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: { data: FRESH_STATE },
    }).as('onboarding');

    cy.visitAuthenticated('/dashboard');
    cy.wait('@onboarding');
    cy.location('pathname').should('eq', '/dashboard/today');

    cy.get('[data-cy="onboarding-checklist"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-add_athlete"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-log_attendance"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-mark_payment"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-upload_document"]').should('be.visible');
    cy.get('[data-cy="onboarding-step-view_stats"]').should('be.visible');

    // No heading over an empty card: every card waits until it has something.
    for (const card of CARDS) {
      cy.get(`[data-cy="${card}"]`).should('not.exist');
    }
    cy.get('[data-cy="today"] h2').should('have.length', 1);
  });

  it('clicking "Show me" on a step navigates and marks it complete', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: { data: FRESH_STATE },
    }).as('onboarding');
    cy.intercept('POST', '/api/v1/me/onboarding/steps', {
      statusCode: 200,
      body: { data: { completed_steps: ['add_athlete'] } },
    }).as('complete');

    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@onboarding');

    cy.get('[data-cy="onboarding-step-add_athlete-cta"] button').click();
    cy.wait('@complete');

    cy.url().should('include', '/dashboard/athletes/new');
  });

  it('keeps the cards under the checklist once the academy has a timetable and people', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: { data: FRESH_STATE },
    }).as('onboarding');
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 1,
            name: 'Fondamentali',
            weekday: 4,
            starts_at: '19:00',
            duration_minutes: 90,
            kind: 'gi',
          },
        ],
      },
    });
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/athletes', query: { sort_by: 'joined_at' } },
      PAGE([], 12),
    );
    cy.intercept('GET', '/api/v1/stats/attendance/daily*', {
      statusCode: 200,
      body: { data: [{ date: '2026-09-22', count: 14 }] },
    });

    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@onboarding');

    cy.get('[data-cy="onboarding-checklist"]').should('be.visible');
    cy.get('[data-cy="today-tonight"]').should('contain.text', 'Fondamentali');
    cy.get('[data-cy="today-watch"]').should('contain.text', 'Nothing to check');
    cy.get('[data-cy="today-teach"]').should('exist');
    cy.get('[data-cy="today-week-presences"]').should('contain.text', '14');
  });

  it('renders nothing when the owner has already dismissed the tour', () => {
    cy.intercept('GET', '/api/v1/me/onboarding', {
      statusCode: 200,
      body: {
        data: {
          dismissed_at: '2026-05-01T00:00:00Z',
          completed_steps: [],
          available_steps: FRESH_STATE.available_steps,
        },
      },
    }).as('onboarding');

    cy.visitAuthenticated('/dashboard/today');
    cy.wait('@onboarding');

    cy.get('[data-cy="today"]').should('exist');
    cy.get('[data-cy="onboarding-checklist"]').should('not.exist');
  });
});
