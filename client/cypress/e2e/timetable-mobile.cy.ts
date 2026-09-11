import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * The weekly timetable on a phone (#1562) — layout only. The business flow
 * (add, edit, remove) lives in `timetable.cy.ts` at the default viewport.
 *
 * What a narrow screen can break here: seven columns that refuse to stack
 * and push the page sideways, tap targets squeezed under the canon's 48px,
 * and a dialog wider than the viewport.
 */

const ACADEMY_OK = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Gracie Barra Torino',
      slug: 'gracie-barra-torino-a1b2c3d4',
      address: null,
      logo_url: null,
      classes_count: 3,
    },
  },
};

const CLASSES = [
  { id: 1, name: 'Kids', weekday: 1, starts_at: '17:00', duration_minutes: 60, kind: 'gi' },
  { id: 2, name: 'Fundamentals', weekday: 1, starts_at: '19:00', duration_minutes: 75, kind: 'gi' },
  { id: 3, name: 'Open mat', weekday: 6, starts_at: null, duration_minutes: null, kind: 'both' },
];

describe('Weekly timetable — mobile layout', () => {
  MOBILE_VIEWPORTS.forEach((vp) => {
    describe(vp.name, () => {
      beforeEach(() => {
        cy.viewport(vp.width, vp.height);
        cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
        cy.intercept('GET', '/api/v1/documents/expiring*', {
          statusCode: 200,
          body: { data: [] },
        });
        cy.intercept('GET', '/api/v1/academy/classes', {
          statusCode: 200,
          body: { data: CLASSES },
        }).as('classes');

        cy.visitAuthenticated('/dashboard/academy/timetable');
        cy.wait('@classes');
      });

      it('stacks the seven days and never scrolls sideways', () => {
        cy.get('[data-cy="timetable-week"] .day').should('have.length', 7);

        // Stacked: Tuesday begins below where Monday ends.
        cy.get('[data-cy="timetable-day-1"]').then(($mon) => {
          const mondayBottom = $mon[0].getBoundingClientRect().bottom;
          cy.get('[data-cy="timetable-day-2"]').then(($tue) => {
            expect($tue[0].getBoundingClientRect().top).to.be.gte(mondayBottom - 1);
          });
        });

        // The one assertion that means "nothing broke out of the viewport".
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
        });
      });

      it('keeps a class a thumb-sized target', () => {
        cy.get('[data-cy="timetable-class-1"]').then(($slot) => {
          expect($slot[0].getBoundingClientRect().height).to.be.gte(48);
        });
        cy.get('[data-cy="timetable-add-2"]').then(($add) => {
          expect($add[0].getBoundingClientRect().height).to.be.gte(44);
        });
      });

      it('opens a form that fits the screen', () => {
        cy.get('[data-cy="timetable-add-3"]').click();

        cy.get('[data-cy="timetable-dialog"] .p-dialog')
          .should('be.visible')
          .then(($dialog) => {
            const rect = $dialog[0].getBoundingClientRect();
            expect(rect.left).to.be.gte(0);
            expect(rect.right).to.be.lte(vp.width);
          });
        cy.get('[data-cy="timetable-form-day-3"]').should('have.attr', 'aria-checked', 'true');
        cy.get('[data-cy="timetable-form-save"]').should('be.visible');
      });
    });
  });
});
