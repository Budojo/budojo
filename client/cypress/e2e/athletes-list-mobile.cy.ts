import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport smoke tests for the athletes list — the SPA's most
// trafficked screen for the instructor on the mat (#240). Existing
// athletes-sort.cy.ts and athletes-form.cy.ts cover business logic
// at the desktop default; this spec is layout-only at narrow widths,
// so a CSS regression like #238 (phone-cc ellipsis on Pixel 8 Pro)
// gets caught before reaching production.

// A fee is configured so the card renders its payment chip — the control
// that turned out to be sitting under the card's stretched link (#1444).
const ACADEMY_OK = {
  statusCode: 200,
  body: { data: { ...MOCK_ACADEMY, monthly_fee_cents: 9500 } },
};

const ATHLETES_TWO = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        phone_country_code: '+39',
        phone_national_number: '3331234567',
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'blue',
        stripes: 2,
        status: 'active',
        joined_at: '2023-01-10',
        created_at: '2026-04-22T10:00:00+00:00',
        // Mario carries socials and Luigi does not — #1445 moved these into
        // the badge row, and the interesting case is a card that has them
        // sitting next to a card that does not.
        facebook: 'https://facebook.com/mario',
        instagram: 'https://instagram.com/mario',
        paid_current_month: true,
        payment_coverage: 'monthly',
      },
      {
        id: 2,
        first_name: 'Luigi',
        last_name: 'Verdi',
        email: 'luigi@example.com',
        phone_country_code: '+39',
        phone_national_number: '3339876543',
        address: null,
        date_of_birth: '1985-09-20',
        belt: 'purple',
        stripes: 1,
        status: 'active',
        joined_at: '2022-06-01',
        created_at: '2026-04-22T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      path: '',
      per_page: 20,
      to: 2,
      total: 2,
    },
  },
};

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Athletes list — mobile smoke (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
      cy.intercept('GET', /\/api\/v1\/athletes(\?|$)/, ATHLETES_TWO).as('athletes');
      cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    });

    it('renders the athlete list without horizontal-scrolling the body', () => {
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      // Body's scrollWidth must equal clientWidth — anything wider means
      // a child element broke out of the viewport (a fixed-width column,
      // a non-wrapping label, etc.) and the user has to scroll sideways
      // to see it. That is the kind of mobile layout bug we want CI to
      // catch.
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'document.scrollWidth').to.be.lte(root.clientWidth);
      });
    });

    it('renders the athlete rows + the list shows both Mario and Luigi', () => {
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      // Below 768px the desktop <p-table> is `display: none` and the
      // mobile card list (`.athletes-page__mobile-list`) renders the
      // athletes instead (#670). Scope the visibility assertion to the
      // mobile container so we don't accidentally select the hidden
      // table's <a.athlete-name__text> which `cy.contains` matches by
      // DOM order (the table comes first in the markup).
      cy.get('[data-cy="athletes-mobile-list"]').within(() => {
        cy.contains('Mario').should('be.visible');
        cy.contains('Luigi').should('be.visible');
      });
    });

    it('keeps the socials inside the badge row rather than under it (#1445)', () => {
      // The change is worth a card row of height only if the icons actually
      // join the badges — and only if joining them does not push the row
      // past the card. Both halves asserted here, at every mobile width.
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      cy.get('[data-cy="athlete-card-social-facebook-1"]')
        .should('be.visible')
        .parents('.athlete-card__badges')
        .should('have.length', 1);

      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'document.scrollWidth').to.be.lte(root.clientWidth);
      });
    });

    it('opens the payment menu instead of navigating when the chip is tapped (#1444)', () => {
      // The card's stretched link covers the whole surface at `z-index: 1`,
      // and every other control on it — the 3-dot, the avatar, the socials —
      // lifts itself above with `z-index: 2`. The payment chip never did, so
      // since #1402 it has been the one badge-row control the overlay
      // swallowed: tapping "Monthly" navigated to the athlete instead of
      // opening its menu, on the form factor this app is built for.
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      cy.get('[data-cy="athlete-card-coverage-1"]').click();

      cy.get('.p-menu').should('be.visible');
      cy.location('pathname').should('eq', '/dashboard/athletes');
    });

    it('shows the belt spine on the card without widening the layout (#1429)', () => {
      // The same durable check as above, specific to the spine: it is
      // `position: absolute` on the card, so a regression here (e.g. a
      // width or inset that pushes past the card edge) would not be caught
      // by the generic scrollWidth check unless the card itself grows —
      // asserting the spine is actually visible closes that gap.
      cy.visitAuthenticated('/dashboard/athletes');
      cy.wait(['@academy', '@athletes']);

      cy.get('[data-cy="athlete-card-1"] [data-cy="belt-spine"]').should('be.visible');
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'document.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});

/**
 * The chrome, on the form factor the canon calls primary (#1503, #1505).
 */
describe('whose gym is this, and how many riddles (#1503, #1505)', () => {
  const ACADEMY_NAMED = {
    statusCode: 200,
    body: {
      data: {
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gracie-barra-torino',
        address: null,
        logo_url: null,
      },
    },
  };

  beforeEach(() => {
    cy.viewport(390, 844);
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NAMED);
    cy.intercept('GET', '/api/v1/documents/expiring*', {
      statusCode: 200,
      body: { data: [], missing_medical_certificate: [] },
    });
    cy.visitAuthenticated('/dashboard/athletes');
  });

  it('names the gym in the topbar, not the product', () => {
    // It said "Budojo". The glyph beside it already carries the product's
    // identity, so the word was the redundant half — and the academy's name
    // was on no phone screen at all.
    cy.get('.topbar__brand-name').should('contain.text', 'Gracie Barra Torino');
    cy.get('.topbar').should('not.contain.text', 'Budojo');
  });

  it('leaves three controls in the toolbar, not five', () => {
    // Hidden and deleted moved into the sheet. They are entered deliberately
    // and rarely, and sat at the same weight as the sort control used on
    // every visit.
    cy.get('[data-cy="athletes-reveal-inactive"]').should('not.be.visible');
    cy.get('[data-cy="athletes-reveal-trashed"]').should('not.be.visible');

    cy.get('[data-cy="filter-sheet-chip"]').should('be.visible');
    cy.get('[data-cy="athletes-sort-belt"]').should('be.visible');
  });

  it('carries them in the sheet instead, in words', () => {
    cy.get('[data-cy="filter-sheet-chip"]').click();

    cy.get('[data-cy="athletes-sheet-trashed"]').should('be.visible');
    cy.get('[data-cy="filter-sheet-panel"]').should('contain.text', 'deleted');
  });
});
