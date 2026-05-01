import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * "What's new" page (#254) — user-facing changelog accessible from
 * the dashboard sidebar above Sign out. The page is inside the
 * dashboard shell so the auth + has-academy guards fire; we use
 * cy.visitAuthenticated to pre-seed the auth_token.
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe("What's new page (#254)", () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
          email_verified_at: '2026-01-01T00:00:00Z',
          deletion_pending: null,
        },
      },
    });
    cy.visitAuthenticated('/dashboard/whats-new');
  });

  it('renders the title and every shipped release card', () => {
    cy.get('.whats-new__title').should('contain.text', 'Recent updates');

    // The latest release sits at the top — assert it's actually
    // visible without scrolling (the user sees it on landing).
    cy.get('[data-cy="whats-new-release-v1.9.0"]').should('be.visible');

    // Older releases are below the fold of the default Cypress
    // viewport (1280×720) — the dashboard shell's `.main` container
    // is `overflow-y: auto`, so they're scroll-clipped not viewport-
    // clipped. We assert presence in the DOM, not visibility, since
    // a user has to scroll either way. The newest-first ordering
    // (which IS load-bearing UX) is pinned in the vitest spec.
    cy.get('[data-cy="whats-new-release-v1.8.0"]').should('exist');
    cy.get('[data-cy="whats-new-release-v1.7.0"]').should('exist');
    cy.get('[data-cy="whats-new-release-v1.6.0"]').should('exist');
    cy.get('[data-cy="whats-new-release-v1.5.0"]').should('exist');
    cy.get('[data-cy="whats-new-release-v1.4.0"]').should('exist');
    cy.get('[data-cy="whats-new-release-v1.3.0"]').should('exist');
  });

  it('the back-to-dashboard CTA returns to /dashboard/athletes', () => {
    cy.get('[data-cy="whats-new-back"]').click();
    // /dashboard redirects to /dashboard/athletes per the route config.
    cy.location('pathname').should('eq', '/dashboard/athletes');
  });

  it("the sidebar carries a What's new link above Sign out", () => {
    cy.get('[data-cy="nav-whats-new"]').should('be.visible').and('contain.text', "What's new");
    // Lives in the same .sidebar__footer block as Sign out — assert
    // the order: the What's new <a> is rendered BEFORE the Sign out
    // <button> in the document.
    cy.get('[data-cy="nav-whats-new"]').then(($whatsNew) => {
      cy.get('[data-cy="nav-sign-out"]').then(($signOut) => {
        const whatsNewIdx = $whatsNew[0].compareDocumentPosition($signOut[0]);
        // DOCUMENT_POSITION_FOLLOWING = 4 — sign-out follows what's-new.
        expect(whatsNewIdx & 4, "sign-out follows what's-new").to.equal(4);
      });
    });
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`What's new fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.intercept('GET', '/api/v1/auth/me', {
        statusCode: 200,
        body: {
          data: {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            email_verified_at: '2026-01-01T00:00:00Z',
            deletion_pending: null,
          },
        },
      });
      cy.visitAuthenticated('/dashboard/whats-new');
    });

    it('document does not overflow horizontally', () => {
      // Same scrollWidth-vs-clientWidth assertion the privacy spec
      // uses — catches a release card or a long bullet that breaks
      // out of the viewport. Text-overflow doesn't change textContent
      // so this is the only honest check.
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
