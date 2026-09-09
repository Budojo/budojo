import { MOCK_ACADEMY } from '../support/fixtures';

// Desktop (>=768px) social rail for the owner shell (#1112), mirroring the
// athlete rail (#1110). The mobile bottom-nav is covered in the component
// spec; this asserts the rail renders + behaves in a real browser at a
// desktop viewport.

const OWNER_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      first_name: 'Sensei',
      last_name: 'Mario',
      full_name: 'Sensei Mario',
      handle: 'senseimario',
      email: 'sensei@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
    },
  },
};

describe('Owner desktop social rail (#1112)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
    // Catch-all first — full paginated envelope so feed-like pages that read
    // meta.current_page don't throw; specific overrides are registered after,
    // so they win.
    cy.intercept('GET', '/api/v1/**', {
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
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me*', OWNER_ME);
  });

  it('renders the destinations, with Stats among them and no Create (#1462)', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.get('[data-cy="owner-rail"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/academy"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/athletes"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/community"]').should('be.visible');
    // Stats came up from the More hub: it was down there because the phone's
    // bottom bar had no room, which is not the rail's constraint.
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/stats"]').should('be.visible');
    cy.get('[data-cy="owner-rail"] a.rail__item[href="/dashboard/more"]').should('be.visible');
    // The ➕ promised to make something, and half of what it offered was a
    // destination. It is gone; the phone's centre button keeps it.
    cy.get('[data-cy="rail-create"]').should('not.exist');
  });

  it('shows the academy mark whole, not cropped and not squashed (#1482)', () => {
    // Two wrong answers already: a bare <img> with no object-fit squashed any
    // logo that was not square, and `cover` fixed the squashing by CROPPING —
    // which cuts the edges off someone's badge. A logo has to arrive whole.
    // A deliberately WIDE mark — 4:1 — because that is the shape that broke:
    // square logos survive any object-fit, and most gym badges are wide.
    const wideLogo =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50">' +
          '<rect width="200" height="50" fill="%23333"/></svg>',
      );
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { ...MOCK_ACADEMY, logo_url: wideLogo } },
    }).as('academyWithLogo');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academyWithLogo');

    cy.get('[data-cy="rail-brand"] img.rail__logo')
      .should('have.css', 'object-fit', 'contain')
      .and(($img) => {
        const el = $img[0] as HTMLImageElement;
        // Square box, so neither dimension can stretch the other.
        expect(el.clientWidth, 'box width').to.equal(el.clientHeight);
        // And the source really is wide, so `contain` is doing work here
        // rather than passing by accident on a square image.
        expect(el.naturalWidth, 'source width').to.be.greaterThan(el.naturalHeight);
      });
  });

  it("pins What's new and Notifications at the foot, in that order (#1462)", () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');

    cy.get('.rail__foot [data-cy="rail-whats-new"]').should('be.visible');
    cy.get('.rail__foot [data-cy="rail-notifications"]').should('be.visible');
    cy.get('.rail__foot a').then(($links) => {
      const order = [...$links].map((el) => el.getAttribute('data-cy'));
      expect(order.indexOf('rail-whats-new')).to.be.lessThan(order.indexOf('rail-notifications'));
    });
  });

  // The chip linked to the More hub until #1351. It shows your avatar, your
  // name and your handle, and every app that shows a user that block opens
  // THAT USER'S profile from it — a settings menu is a signifier that lies.
  it('points the brand at the academy home + pins a profile chip linking to your profile', () => {
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.get('a.rail__brand').should('have.attr', 'href', '/dashboard/academy');
    cy.get('[data-cy="rail-profile"]')
      .should('be.visible')
      .and('have.attr', 'href', '/dashboard/profile');
  });
});
