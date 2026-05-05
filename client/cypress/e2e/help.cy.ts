/**
 * `/help` — public Help / FAQ page (#422).
 *
 * The route is unauthenticated (same shape as `/privacy`) so a
 * prospect, a setup-wizard user mid-flow, and an existing customer
 * all reach it. We exercise three things here:
 *
 *   1. The page renders at `/help` without auth — no `cy.visitAuthenticated`
 *      pre-seed needed.
 *   2. The client-side search filter narrows the visible entries.
 *   3. A deep-link to a stable anchor (`/help#how-to-add-payment`)
 *      scrolls the matching entry into view — the contract that
 *      lets in-app empty states and tooltips link to specific
 *      questions.
 *
 * Vitest already pins the entry-id list, the empty-state, and the
 * pre-seeded `?q=` deep-link; we don't re-assert them here.
 */
describe('Public help / FAQ page (#422)', () => {
  it('loads at /help without authentication and shows the FAQ list', () => {
    cy.visit('/help');
    cy.get('.help-page__title').should('contain.text', 'Help & frequently asked questions');

    // The six categories must all be on the page (the order is
    // pinned in the vitest spec; here we only assert presence).
    cy.get('[data-cy="help-category-getting-started"]').should('exist');
    cy.get('[data-cy="help-category-athletes"]').should('exist');
    cy.get('[data-cy="help-category-attendance"]').should('exist');
    cy.get('[data-cy="help-category-payments"]').should('exist');
    cy.get('[data-cy="help-category-documents"]').should('exist');
    cy.get('[data-cy="help-category-account"]').should('exist');
  });

  it('filters entries client-side as the user types', () => {
    cy.visit('/help');

    // No filter → all entries visible.
    cy.get('.help-page__entry').its('length').should('be.gte', 15);

    cy.get('[data-cy="help-search-input"]').type('spreadsheet');

    // The "import-athletes" entry mentions "spreadsheet" in the
    // EN answer; nothing else should match on that keyword.
    cy.get('[data-cy="help-entry-import-athletes"]').should('be.visible');
    cy.get('.help-page__entry').should('have.length', 1);
  });

  it('the dashboard sidebar footer carries a /help link', () => {
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          name: 'Test academy',
          training_days: ['monday'],
          monthly_fee_cents: null,
          phone: null,
          email: null,
          instagram: null,
          website: null,
          maps_url: null,
          address_line1: null,
          address_line2: null,
          address_zip: null,
          address_city: null,
          address_state: null,
          address_country: null,
          logo_url: null,
        },
      },
    });
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
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
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

    cy.visitAuthenticated('/dashboard/athletes');
    cy.get('[data-cy="sidebar-help-link"]').should('be.visible').and('contain.text', 'Help');
    cy.get('[data-cy="sidebar-help-link"]').click();
    cy.location('pathname').should('eq', '/help');
  });

  it('deep-links via /help#anchor scroll the targeted entry into view', () => {
    // Pick an entry that's far enough down the page that the test
    // is meaningful — the very first entry on the page sits at the
    // top regardless of anchor scrolling, so use one from the
    // Payments category (5th of 6 categories).
    cy.visit('/help#unpaid-badge');

    // The targeted section exists at the right id…
    cy.get('#unpaid-badge').should('exist');

    // …and it gets scrolled into view. We assert the entry is
    // visible (not behind the fold) — Cypress's `be.visible`
    // accounts for viewport position, so a successful anchor
    // scroll satisfies it; a no-scroll fallback would leave the
    // entry below the viewport on the default 1280×720.
    cy.get('[data-cy="help-entry-unpaid-badge"]').should('be.visible');
  });

  it('clicking the per-entry anchor link updates the URL fragment', () => {
    cy.visit('/help');

    cy.get('[data-cy="help-entry-add-athlete"]')
      .find('[data-cy="help-entry-anchor"]')
      .first()
      .click();

    cy.location('hash').should('eq', '#add-athlete');
  });
});
