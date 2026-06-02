import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Mobile-viewport coverage for the Profile page (#240). The "Your data"
// export card had a vertical-stacking regression on Pixel 8 Pro that
// was caught after release in v1.9.0; this spec keeps that class of
// regression locked in.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };
const ATHLETES_EMPTY = {
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
};
const EXPIRING_EMPTY = { statusCode: 200, body: { data: [] } };
const ME_OK = {
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
      deletion_pending: null,
    },
  },
};

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Profile page fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
      cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_EMPTY);
      cy.intercept('GET', '/api/v1/auth/me', ME_OK);
      cy.visitAuthenticated('/dashboard/profile');
      // Assert Identity-tab content (default active) BEFORE switching to
      // Account. `profile-name` is a `__sr-only` + `aria-hidden="true"` span
      // (profile.component.scss:239-243) — invisible to sighted users AND out
      // of the accessibility tree, kept purely as a selector hook after #848
      // split the visible name into `profile-first-name`/`profile-last-name`.
      // So assert `exist` (it can never be `be.visible`). Both it and
      // `profile-email` live inside the `@if (activeTab() === 'identity')`
      // block, which Angular unmounts once we click the Account tab below —
      // hence these run here, not inside the it().
      cy.get('[data-cy="profile-name"]').should('exist').and('contain.text', 'Mario');
      cy.get('[data-cy="profile-email"]').should('be.visible');
      cy.get('[data-cy="profile-tab-account"]').click();
    });

    it('renders profile + Your data card without horizontal overflow', () => {
      cy.get('[data-cy="profile-data-export"]').should('be.visible');
      cy.get('[data-cy="profile-export-data"]').should('be.visible');

      // Same scrollWidth-vs-clientWidth assertion the privacy +
      // whats-new mobile specs use — catches a child element that
      // breaks out of the viewport. text-overflow doesn't change
      // textContent, so the visibility check above isn't a guard
      // against a hidden overflow.
      cy.document().then((doc) => {
        const root = doc.documentElement;
        expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
      });
    });
  });
});
