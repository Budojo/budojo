import { MOCK_ACADEMY } from '../support/fixtures';
import { MOBILE_VIEWPORTS } from '../support/viewports';

// Today (#1643) on a phone: one column, nothing wider than the screen. The
// business flow is covered by today.cy.ts; this is layout only.
const NOW = new Date(2026, 8, 24, 18, 30).getTime();

const PAGE = {
  data: [],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 4 },
};

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Today — mobile smoke (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.clock(NOW, ['Date']);
      cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: PAGE });
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: { data: { ...MOCK_ACADEMY, monthly_fee_cents: 6000 } },
      }).as('academy');
      cy.intercept('GET', '/api/v1/academy/classes', {
        statusCode: 200,
        body: {
          data: [
            {
              id: 1,
              name: 'Fondamentali e tecnica di base',
              weekday: 4,
              starts_at: '19:00',
              duration_minutes: 90,
              kind: 'gi',
            },
          ],
        },
      });
      cy.intercept('GET', '/api/v1/documents/expiring*', {
        statusCode: 200,
        body: { data: [{ id: 1, type: 'medical_certificate' }], missing_medical_certificate: [] },
      });
    });

    it('renders Today without horizontal-scrolling the body', () => {
      cy.visitAuthenticated('/dashboard/today');
      cy.wait('@academy');
      cy.get('[data-cy="today-class-1"]').should('be.visible');
      cy.get('[data-cy="today-watch-unpaid"]').should('be.visible');

      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
    });
  });
});
