export {};

/**
 * Closures on the timetable page (#1766): the days the academy is shut, which
 * every attendance count and the missed-streak alert then leave out.
 */

const SUMMER = { id: 1, starts_on: '2026-08-10', ends_on: '2026-08-25', label: 'Chiusura estiva' };

function academy(closures: object[]) {
  return {
    statusCode: 200,
    body: {
      data: {
        id: 1,
        name: 'Gracie Barra Torino',
        slug: 'gracie-barra-torino-a1b2c3d4',
        address: null,
        logo_url: null,
        classes_count: 0,
        closures,
      },
    },
  };
}

describe('Timetable closures', () => {
  beforeEach(() => {
    // Registered first, so the specific stubs below win: an unstubbed read
    // (the bell's notifications) otherwise reaches no server, 401s and signs
    // the test out mid-flow.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [] } });
  });

  it('lists the closures with their dates, name and length', () => {
    cy.intercept('GET', '/api/v1/academy', academy([SUMMER]));
    cy.visitAuthenticated('/dashboard/academy/timetable');

    cy.get('[data-cy="closures-row-1"]')
      .should('contain.text', 'Chiusura estiva')
      .and('contain.text', '16 days');
  });

  it('adds a closure picked in the calendars', () => {
    cy.intercept('GET', '/api/v1/academy', academy([])).as('academy');
    cy.intercept('POST', '/api/v1/academy/closures', {
      statusCode: 201,
      body: { data: SUMMER },
    }).as('create');
    cy.visitAuthenticated('/dashboard/academy/timetable');
    cy.get('[data-cy="closures-empty"]').should('be.visible');

    cy.get('[data-cy="closures-add"]').click();
    cy.get('[data-cy="closures-dialog"]').should('be.visible');
    // Picked from the panel, as carnets.cy.ts and athlete-promotions.cy.ts do.
    // The last-day picker cannot go before the first, so its first selectable
    // day is the same one: a one-day closure.
    cy.get('#closure-from').click();
    cy.get('.p-datepicker-panel td:not(.p-datepicker-other-month) span:not(.p-disabled)')
      .first()
      .click();
    // The first panel must be gone: appendTo="body" puts both panels' days
    // under one selector, and a closing one steals the next click.
    cy.get('.p-datepicker-panel').should('not.exist');
    cy.get('#closure-to').click();
    cy.get('.p-datepicker-panel').should('have.length', 1);
    cy.get('.p-datepicker-panel td:not(.p-datepicker-other-month) span:not(.p-disabled)')
      .first()
      .click();
    cy.get('.p-datepicker-panel').should('not.exist');
    cy.get('#closure-to').invoke('val').should('not.be.empty');
    cy.get('[data-cy="closures-form-label"]').type('Chiusura estiva');
    cy.intercept('GET', '/api/v1/academy', academy([SUMMER]));
    cy.get('[data-cy="closures-form-save"]').click();

    cy.wait('@create')
      .its('request.body')
      .should((body: { starts_on: string; ends_on: string; label: string }) => {
        expect(body.starts_on).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.ends_on).to.equal(body.starts_on);
        expect(body.label).to.equal('Chiusura estiva');
      });
    cy.get('[data-cy="closures-row-1"]').should('contain.text', 'Chiusura estiva');
  });

  it('refuses a last day before the first, saying why', () => {
    cy.intercept('GET', '/api/v1/academy', academy([]));
    cy.visitAuthenticated('/dashboard/academy/timetable');

    cy.get('[data-cy="closures-add"]').click();
    cy.get('[data-cy="closures-form-save"]').click();

    cy.get('[data-cy="closures-form-dates-error"]').should('be.visible');
  });

  it('removes a closure after a confirm', () => {
    cy.intercept('GET', '/api/v1/academy', academy([SUMMER]));
    cy.intercept('DELETE', '/api/v1/academy/closures/1', { statusCode: 204 }).as('remove');
    cy.visitAuthenticated('/dashboard/academy/timetable');

    cy.get('[data-cy="closures-row-1"]').click();
    cy.get('[data-cy="closures-form-remove"]').click();
    cy.intercept('GET', '/api/v1/academy', academy([]));
    cy.get('.p-confirmdialog-accept-button').click();

    cy.wait('@remove');
    cy.get('[data-cy="closures-empty"]').should('be.visible');
  });
});
