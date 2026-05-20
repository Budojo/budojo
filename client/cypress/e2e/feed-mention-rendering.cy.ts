/**
 * Cypress E2E for feed @handle mention rendering (#864, M9 social-profile
 * epic slice B).
 *
 * Verifies that an owner announcement body containing `@handle` segments
 * is rendered with the matching parts as anchors pointing at
 * `/dashboard/u/<handle>`. Surrounding text stays as plain text — no
 * existence-leak (the SPA links unconditionally; the public-profile
 * page itself 404s when the handle isn't visible to this viewer).
 *
 * No backend — every HTTP call is stubbed.
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

function feedPage(body: string) {
  return {
    statusCode: 200,
    body: {
      data: [
        {
          id: 101,
          type: 'owner_announcement',
          visibility: 'academy',
          payload: { body },
          created_at: '2026-05-20T12:00:00+00:00',
          created_by: {
            id: 1,
            first_name: 'Owner',
            last_name: 'User',
            full_name: 'Owner User',
            handle: 'owner1',
            avatar_url: null,
            belt: null,
            stripes: null,
            role: 'owner',
          },
          reactions_count: 0,
          reaction_counts: { clap: 0, pray: 0 },
          comments_count: 0,
          rsvps_count: 0,
          going_rsvps_count: 0,
          maybe_rsvps_count: 0,
          your_reaction: null,
          your_rsvp: null,
        },
      ],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    },
  };
}

describe('Feed @handle mention rendering (#864)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy*', ACADEMY_OK);
  });

  it('renders @handle inside an announcement body as a router link to /dashboard/u/<handle>', () => {
    cy.intercept(
      'GET',
      '/api/v1/community/feed*',
      feedPage('Congrats @mariobjj on the promotion!'),
    ).as('feed');

    cy.visitAuthenticated('/dashboard/community');
    cy.wait('@feed');

    cy.get('[data-cy="post-announcement"]')
      .find('[data-cy="mention-link"]')
      .should('exist')
      .and('contain.text', '@mariobjj')
      .and('have.attr', 'href', '/dashboard/u/mariobjj');

    cy.get('[data-cy="post-announcement"]').should('contain.text', 'Congrats').and('contain.text', 'on the promotion!');
  });

  it('renders an announcement body with no mention as plain text (no anchor leakage)', () => {
    cy.intercept(
      'GET',
      '/api/v1/community/feed*',
      feedPage('General announcement — class moved to 19:30 this week.'),
    ).as('feedPlain');

    cy.visitAuthenticated('/dashboard/community');
    cy.wait('@feedPlain');

    cy.get('[data-cy="post-announcement"]').should(
      'contain.text',
      'General announcement — class moved to 19:30 this week.',
    );
    cy.get('[data-cy="post-announcement"] [data-cy="mention-link"]').should('not.exist');
  });
});
