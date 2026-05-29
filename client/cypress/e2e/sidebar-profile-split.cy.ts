/**
 * Cypress E2E for the sidebar profile / settings split (#863, M9
 * social-profile epic slice C) — OWNER shell.
 *
 * The owner shell `/dashboard/*` keeps the desktop sidebar: the "Profilo"
 * voice is "Settings" (cog icon, same `/dashboard/profile` route hosting the
 * settings tabs), and a "My profile" voice points to the public profile at
 * `/dashboard/u/<handle>` — visible only when the cached user has a handle.
 *
 * The athlete shell no longer carries these as sidebar rows: since #1110 its
 * desktop chrome is the social rail (Feed/Academy/Attendance/More + ➕), and
 * Settings / My profile live on the `/dashboard/me/more` hub — covered by
 * `me-more.component.spec.ts` (`me-more-settings`, `me-more-public-profile`).
 *
 * The link is asserted to EXIST (and carry the expected href) — we do NOT
 * navigate through it.
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

describe('Sidebar profile / settings split (#863) — owner shell', () => {
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

  it('owner shell: renders Settings voice with cog icon + My profile voice when handle is set', () => {
    cy.intercept('GET', '/api/v1/auth/me*', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Mario Rossi',
          handle: 'mariobjj',
          email: 'mario@example.com',
          email_verified_at: '2026-01-01T00:00:00Z',
          avatar_url: null,
        },
      },
    });

    cy.visitAuthenticated('/dashboard/athletes');

    cy.get('[data-cy="nav-settings"]')
      .should('exist')
      .and('contain.text', 'Settings')
      .find('i.pi-cog')
      .should('exist');

    cy.get('[data-cy="nav-my-profile"]')
      .should('exist')
      .and('contain.text', 'My profile')
      .and('have.attr', 'href', '/dashboard/u/mariobjj');
  });

  it('owner shell: hides the My profile voice when the user has no handle (opt-in today)', () => {
    cy.intercept('GET', '/api/v1/auth/me*', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Mario Rossi',
          handle: null,
          email: 'mario@example.com',
          email_verified_at: '2026-01-01T00:00:00Z',
          avatar_url: null,
        },
      },
    });

    cy.visitAuthenticated('/dashboard/athletes');

    cy.get('[data-cy="nav-settings"]').should('exist');
    cy.get('[data-cy="nav-my-profile"]').should('not.exist');
  });
});
