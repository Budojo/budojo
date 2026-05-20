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

function authMeAs(role: 'owner' | 'athlete') {
  return {
    statusCode: 200,
    body: {
      data: {
        id: role === 'owner' ? 1 : 2,
        first_name: role === 'owner' ? 'Owner' : 'Alice',
        last_name: 'User',
        full_name: role === 'owner' ? 'Owner User' : 'Alice User',
        handle: role === 'owner' ? 'owner1' : 'alicebjj',
        email: `${role}@example.com`,
        email_verified_at: '2026-01-01T00:00:00Z',
        avatar_url: null,
        role,
      },
    },
  };
}

describe('Feed @handle mention rendering (#864)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy*', ACADEMY_OK);
    // Every test stubs an explicit role on /auth/me — without it the
    // default test-user has no `role` and MentionTextComponent silently
    // defaults to the owner path, which would pass the owner case for
    // the wrong reason. The per-it variants below override the role.
    cy.intercept('GET', '/api/v1/auth/me*', authMeAs('owner'));
  });

  it('owner viewer: @handle inside an announcement links to /dashboard/u/<handle>', () => {
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

    cy.get('[data-cy="post-announcement"]')
      .should('contain.text', 'Congrats')
      .and('contain.text', 'on the promotion!');
  });

  it('athlete viewer: @handle inside an announcement links to /dashboard/me/u/<handle>', () => {
    // Override the beforeEach owner stub for this test only.
    cy.intercept('GET', '/api/v1/auth/me*', authMeAs('athlete'));
    cy.intercept(
      'GET',
      '/api/v1/community/feed*',
      feedPage('Congrats @mariobjj on the promotion!'),
    ).as('feedAthlete');

    cy.visitAuthenticated('/dashboard/me/feed');
    cy.wait('@feedAthlete');

    cy.get('[data-cy="post-announcement"]')
      .find('[data-cy="mention-link"]')
      .should('exist')
      .and('contain.text', '@mariobjj')
      .and('have.attr', 'href', '/dashboard/me/u/mariobjj');
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

  // Comment-body mention rendering is covered at the Vitest integration
  // layer in comments-thread.component.spec.ts. We deliberately don't
  // exercise it through Cypress + ng serve because the dynamic-import
  // chunk renaming during hot-reload makes the click-to-open-thread
  // step flaky enough that the signal-to-noise ratio drops below the
  // value of the assertion (the wiring change in the template is a
  // one-liner: <app-mention-text [text]="c.body" />).
});
