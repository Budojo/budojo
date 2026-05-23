/**
 * Cypress E2E for athlete self-registration of today's presence (#960).
 *
 * Three user flows pinned end-to-end:
 *   1. Athlete lands → unmarked panel → tap "Sono qui oggi" → marked
 *      panel with the Cancel button (their own self-mark).
 *   2. Athlete lands → tap "Annulla presenza" → unmarked panel.
 *   3. Athlete lands when today isn't a training day → quiet
 *      "not training" panel, no mark button.
 *
 * No backend — every HTTP call is stubbed. The athlete shell uses
 * the `roleAthleteGuard` so we stub `/auth/me` to return an athlete
 * persona BEFORE the visit (visitAuthenticated pre-seeds the token).
 */

import { MOCK_ACADEMY_RESPONSE } from '../support/fixtures';

const ATHLETE_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 2,
      first_name: 'Alice',
      last_name: 'User',
      full_name: 'Alice User',
      handle: 'alicebjj',
      email: 'alice@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
      role: 'athlete',
    },
  },
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const SELF_MARK_RECORD = (id: number) => ({
  statusCode: 201,
  body: {
    data: {
      id,
      athlete_id: 2,
      attended_on: todayIso(),
      notes: null,
      source: 'self',
      created_at: new Date().toISOString(),
      deleted_at: null,
    },
  },
});

describe('Athlete self-mark attendance (#960)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy*', MOCK_ACADEMY_RESPONSE);
    cy.intercept('GET', '/api/v1/auth/me*', ATHLETE_ME);
    // Peer-preview endpoint (#958). Defaults to empty so the page
    // boots in the "be the first" empty state; per-test overrides
    // populate it.
    cy.intercept('GET', '/api/v1/me/attendance/today/peers', {
      statusCode: 200,
      body: { data: [] },
    });
  });

  it('mark flow: unmarked panel → tap "Sono qui oggi" → marked panel with Annulla', () => {
    cy.intercept('POST', '/api/v1/me/attendance/today', SELF_MARK_RECORD(99)).as('mark');

    cy.visitAuthenticated('/dashboard/me/attendance/today');

    // Lands in the unmarked state with the primary CTA visible.
    cy.get('[data-cy="attendance-today-unmarked"]').should('be.visible');
    cy.get('[data-cy="attendance-today-mark"]').should('be.visible').click();

    cy.wait('@mark');

    // Marked panel + Cancel button appear (source=self).
    cy.get('[data-cy="attendance-today-marked"]').should('be.visible');
    cy.get('[data-cy="attendance-today-unmark"]').should('be.visible');
  });

  it('unmark flow: marked panel → tap "Annulla presenza" → unmarked panel', () => {
    // Seed the marked state via a mark first (same fixture).
    cy.intercept('POST', '/api/v1/me/attendance/today', SELF_MARK_RECORD(99)).as('mark');
    cy.intercept('DELETE', '/api/v1/me/attendance/today', { statusCode: 204, body: '' }).as(
      'unmark',
    );

    cy.visitAuthenticated('/dashboard/me/attendance/today');
    cy.get('[data-cy="attendance-today-mark"]').click();
    cy.wait('@mark');

    cy.get('[data-cy="attendance-today-unmark"]').click();
    cy.wait('@unmark');

    cy.get('[data-cy="attendance-today-unmarked"]').should('be.visible');
    cy.get('[data-cy="attendance-today-unmark"]').should('not.exist');
  });

  it('not-training-day: 422 response surfaces the quiet rest-day panel', () => {
    cy.intercept('POST', '/api/v1/me/attendance/today', {
      statusCode: 422,
      body: { message: 'Not a training day today.' },
    }).as('mark422');

    cy.visitAuthenticated('/dashboard/me/attendance/today');
    cy.get('[data-cy="attendance-today-mark"]').click();
    cy.wait('@mark422');

    cy.get('[data-cy="attendance-today-not-training"]').should('be.visible');
    cy.get('[data-cy="attendance-today-mark"]').should('not.exist');
    cy.get('[data-cy="attendance-today-back"]').should(
      'have.attr',
      'href',
      '/dashboard/me/profile',
    );
  });

  // ─── #958 peer preview ─────────────────────────────────────────

  it('peer preview: empty state when no peer is marked yet', () => {
    cy.visitAuthenticated('/dashboard/me/attendance/today');
    cy.get('[data-cy="attendance-peers-empty"]').should('be.visible');
  });

  it('peer preview: renders chips from the peers endpoint, no full last_name leak', () => {
    cy.intercept('GET', '/api/v1/me/attendance/today/peers', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 11,
            first_name: 'Mario',
            last_name_initial: 'R',
            handle: 'mariobjj',
            belt: 'blue',
            avatar_url: null,
          },
          {
            id: 12,
            first_name: 'Alice',
            last_name_initial: 'B',
            handle: null,
            belt: 'white',
            avatar_url: null,
          },
        ],
      },
    });
    cy.visitAuthenticated('/dashboard/me/attendance/today');
    cy.get('[data-cy="attendance-peer-11"]').should('be.visible');
    cy.get('[data-cy="attendance-peer-12"]').should('be.visible');
    // No anchor anywhere on the peer surface should leak full last names
    // the API never sent.
    cy.get('[data-cy="attendance-peers-row"]')
      .invoke('text')
      .should('not.contain', 'Rossi')
      .and('not.contain', 'Bianchi');
  });
});
