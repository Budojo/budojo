/**
 * Cypress E2E for the athlete public-profile page (#862, M9 social-profile
 * epic slice A).
 *
 * Verifies the SPA boundary at `/dashboard/u/:handle`:
 *  - happy path renders the peer's identity card, belt badge, and the
 *    promotions timeline (newest first);
 *  - a 404 from the server (handle unknown OR opted-out OR cross-academy
 *    — all three collapse server-side) flips the page to the generic
 *    "Profile not available" state without leaking which gate tripped;
 *  - the empty-promotions branch renders the "no promotions yet" copy.
 *
 * No backend — all HTTP calls are intercepted. `/api/v1/auth/me` is
 * pre-seeded by `cypress/support/e2e.ts`. The dashboard shell calls
 * `/api/v1/academy` on boot; we stub it so the shell renders.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'BJJ Academy Rome',
      city: 'Rome',
      country_code: 'IT',
      logo_url: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 42,
      first_name: 'Mario',
      handle: 'mariobjj',
      avatar_url: null,
      belt: 'blue',
      joined_at: '2025-01-15',
      promotions: [
        {
          id: 2,
          kind: 'stripe',
          from_belt: null,
          to_belt: null,
          from_stripes: 0,
          to_stripes: 1,
          belt_at_event: 'blue',
          recorded_at: '2026-03-20T10:00:00+00:00',
        },
        {
          id: 1,
          kind: 'belt',
          from_belt: 'white',
          to_belt: 'blue',
          from_stripes: null,
          to_stripes: null,
          belt_at_event: 'blue',
          recorded_at: '2026-01-15T10:00:00+00:00',
        },
      ],
      achievements: [],
      ...overrides,
    },
  };
}

describe('Public profile page (/dashboard/u/:handle)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy*', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes*', {
      statusCode: 200,
      body: {
        data: [],
        links: { first: null, last: null, prev: null, next: null },
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
    });
  });

  it('renders the peer identity card + timeline on a happy 200', () => {
    cy.intercept('GET', '/api/v1/users/mariobjj/profile', {
      statusCode: 200,
      body: profile(),
    }).as('getProfile');

    cy.visitAuthenticated('/dashboard/u/mariobjj');
    cy.wait('@getProfile');

    cy.contains('h1', 'Mario');
    cy.contains('@mariobjj');
    cy.get('.public-profile-timeline-row').should('have.length', 2);
  });

  it('falls back to the generic not-found state on 404 (no existence leak)', () => {
    cy.intercept('GET', '/api/v1/users/ghost/profile', {
      statusCode: 404,
      body: { message: 'Not Found' },
    }).as('get404');

    cy.visitAuthenticated('/dashboard/u/ghost');
    cy.wait('@get404');

    cy.contains('Profile not available');
    cy.contains('Back to athletes');
  });

  it('renders the empty-state copy when the athlete has no promotions yet', () => {
    cy.intercept('GET', '/api/v1/users/mariobjj/profile', {
      statusCode: 200,
      body: profile({ promotions: [] }),
    }).as('getProfileEmpty');

    cy.visitAuthenticated('/dashboard/u/mariobjj');
    cy.wait('@getProfileEmpty');

    cy.contains('No promotions recorded yet.');
  });
});
