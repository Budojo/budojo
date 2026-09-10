import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Belt + stripe promotion history — the read timeline (post-v2.9.0),
 * correcting `recorded_at` on an existing row (#1431 PR 1), and backfilling
 * / deleting historical rows (#1431 PR 2). Every call is intercepted, so
 * what this proves is the client wiring: the pencil opens a dialog seeded
 * with the row's own date, "add a past promotion" composes the right
 * per-kind payload, a chain-consistency 422 surfaces inline rather than a
 * generic toast, and delete goes through the shared confirm popup.
 */

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

const ATHLETE = {
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: null,
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: null,
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2025-01-10',
  created_at: '2025-01-10T10:00:00+00:00',
  is_self: false,
};

function promotion(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 1,
    to_stripes: 2,
    belt_at_event: 'blue',
    recorded_at: '2026-09-01T10:00:00+00:00',
    recorded_by: { id: 1, full_name: 'Owner User' },
    ...over,
  };
}

function promotionsPage(rows: unknown[]) {
  return {
    statusCode: 200,
    body: {
      data: rows,
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        path: '',
        per_page: 20,
        to: rows.length,
        total: rows.length,
      },
    },
  };
}

describe('Athlete promotion history (#1431)', () => {
  beforeEach(() => {
    // Catch-all FIRST — see docs/development/visual-verification.md and the
    // repo gotchas: any dashboard-shell call left unmocked reaches the live
    // local backend and the fake `visitAuthenticated` token gets a genuine
    // 401, which logs the session out mid-test.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } }).as(
      'athlete',
    );
  });

  it('renders the timeline and opens the edit dialog seeded with the row date', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-9"]')
      .scrollIntoView()
      .should('be.visible')
      .and('contain.text', 'stripes');
    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-dialog"]').should('be.visible');
    // Seeded from the row's own date — confirming with no further input is
    // exactly the "just fix the year" case the issue describes.
    cy.get('[data-cy="promotion-edit-date"] input').should('have.value', '01/09/2026');
  });

  it('confirms, PATCHes the date, and reloads the timeline', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', {
      statusCode: 200,
      body: { data: promotion({ recorded_at: '2026-03-15T00:00:00+00:00' }) },
    }).as('patch');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.intercept(
      'GET',
      '/api/v1/athletes/1/promotions*',
      promotionsPage([promotion({ recorded_at: '2026-03-15T00:00:00+00:00' })]),
    ).as('reload');

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-confirm"]').click();

    cy.wait('@patch')
      .its('request.body.recorded_at')
      .should('match', /^\d{4}-\d{2}-\d{2}$/);
    cy.wait('@reload');
    // The `<p-dialog>` host stays in the DOM; only the overlay mask
    // mounts/unmounts (see athlete-documents.cy.ts) — a reliable signal
    // for "dialog is closed" that `not.be.visible` on the host isn't.
    cy.get('.p-dialog-mask').should('not.exist');
  });

  it('cancel closes the dialog and never calls the server', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', {
      statusCode: 200,
      body: { data: promotion() },
    }).as('patch');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-cancel"]').click();
    // The `<p-dialog>` host stays in the DOM; only the overlay mask
    // mounts/unmounts (see athlete-documents.cy.ts) — a reliable signal
    // for "dialog is closed" that `not.be.visible` on the host isn't.
    cy.get('.p-dialog-mask').should('not.exist');
    cy.get('@patch.all').should('have.length', 0);
  });

  it('surfaces an error toast when the correction fails, without losing the row', () => {
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
      'promotions',
    );
    cy.intercept('PATCH', '/api/v1/athletes/1/promotions/9', { statusCode: 422 }).as('patchFails');

    cy.visitAuthenticated('/dashboard/athletes/1/promotions');
    cy.wait(['@academy', '@athlete', '@promotions']);

    cy.get('[data-cy="promotion-edit-9"]').click();
    cy.get('[data-cy="promotion-edit-confirm"]').click();
    cy.wait('@patchFails');

    cy.contains(/couldn.t update the date/i).should('be.visible');
    // The row is unchanged — a failed correction is not a silent data loss.
    cy.get('[data-cy="promotion-9"]').should('be.visible');
  });

  describe('backfilling a historical promotion (#1431 PR 2 of 2)', () => {
    it('adds a belt promotion and reloads the timeline', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );
      cy.intercept('POST', '/api/v1/athletes/1/promotions', {
        statusCode: 201,
        body: {
          data: promotion({
            id: 10,
            kind: 'belt',
            from_belt: 'white',
            to_belt: 'blue',
            from_stripes: null,
            to_stripes: null,
            recorded_at: '2019-03-15T00:00:00+00:00',
          }),
        },
      }).as('create');

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.intercept(
        'GET',
        '/api/v1/athletes/1/promotions*',
        promotionsPage([
          promotion(),
          promotion({
            id: 10,
            kind: 'belt',
            from_belt: 'white',
            to_belt: 'blue',
            from_stripes: null,
            to_stripes: null,
            recorded_at: '2019-03-15T00:00:00+00:00',
          }),
        ]),
      ).as('reload');

      cy.get('[data-cy="promotions-add"]').click();
      cy.get('[data-cy="promotion-create-dialog"]').should('be.visible');
      // Defaults to Belt — filling the two selects + a date is the whole
      // flow. Picked from the calendar panel, not typed: typing leaves the
      // panel open over the next field (carnets.cy.ts uses the same click).
      cy.get('[data-cy="promotion-create-date"] input').click();
      cy.get('.p-datepicker-panel td span:not(.p-disabled)').first().click();
      cy.get('[data-cy="promotion-create-from-belt"]').click();
      cy.get('.p-select-option').contains('White').click();
      cy.get('[data-cy="promotion-create-to-belt"]').click();
      cy.get('.p-select-option').contains('Blue').click();
      cy.get('[data-cy="promotion-create-confirm"]').click();

      cy.wait('@create').then(({ request }) => {
        expect(request.body.recorded_at).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(request.body).to.deep.include({ kind: 'belt', from_belt: 'white', to_belt: 'blue' });
      });
      cy.wait('@reload');
      cy.get('.p-dialog-mask').should('not.exist');
      cy.get('[data-cy="promotion-10"]').should('be.visible');
    });

    it('adds a stripe promotion once switched to the Stripe kind', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );
      cy.intercept('POST', '/api/v1/athletes/1/promotions', {
        statusCode: 201,
        body: { data: promotion({ id: 11, recorded_at: '2020-06-01T00:00:00+00:00' }) },
      }).as('create');

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.get('[data-cy="promotions-add"]').click();
      cy.get('[data-cy="promotion-create-kind"]').contains('Stripe').click();
      cy.get('[data-cy="promotion-create-date"] input').click();
      cy.get('.p-datepicker-panel td span:not(.p-disabled)').first().click();
      cy.get('[data-cy="promotion-create-belt-at-event"]').click();
      cy.get('.p-select-option').contains('Blue').click();
      // Confirm both the pick landed AND its overlay is fully gone before
      // the next select opens — appendTo="body" puts every panel's options
      // under the same `.p-select-option` selector, so a still-closing
      // overlay can steal a click meant for the next one.
      cy.get('[data-cy="promotion-create-belt-at-event"]').should('contain.text', 'Blue');
      cy.get('.p-select-option').should('not.exist');
      cy.get('[data-cy="promotion-create-from-stripes"]')
        .should('not.have.class', 'p-disabled')
        .click();
      cy.get('.p-select-option').contains('1').click();
      cy.get('[data-cy="promotion-create-from-stripes"]').should('contain.text', '1');
      cy.get('.p-select-option').should('not.exist');
      cy.get('[data-cy="promotion-create-to-stripes"]')
        .should('not.have.class', 'p-disabled')
        .click();
      cy.get('.p-select-option').contains('2').click();
      cy.get('[data-cy="promotion-create-to-stripes"]').should('contain.text', '2');
      cy.get('[data-cy="promotion-create-confirm"]').click();

      cy.wait('@create').then(({ request }) => {
        expect(request.body.recorded_at).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(request.body).to.deep.include({
          kind: 'stripe',
          belt_at_event: 'blue',
          from_stripes: 1,
          to_stripes: 2,
        });
      });
    });

    it('surfaces a chain-consistency conflict inline and keeps the dialog open', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );
      cy.intercept('POST', '/api/v1/athletes/1/promotions', {
        statusCode: 422,
        body: {
          message: 'The given data was invalid.',
          errors: {
            from_belt: [
              "Doesn't match the belt after the previous promotion on 2019-01-01 (white).",
            ],
          },
        },
      }).as('createFails');

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.get('[data-cy="promotions-add"]').click();
      cy.get('[data-cy="promotion-create-date"] input').click();
      cy.get('.p-datepicker-panel td span:not(.p-disabled)').first().click();
      cy.get('[data-cy="promotion-create-from-belt"]').click();
      cy.get('.p-select-option').contains('White').click();
      cy.get('[data-cy="promotion-create-to-belt"]').click();
      cy.get('.p-select-option').contains('Purple').click();
      cy.get('[data-cy="promotion-create-confirm"]').click();
      cy.wait('@createFails');

      cy.get('[data-cy="promotion-create-error"]').should(
        'contain.text',
        "Doesn't match the belt after the previous promotion",
      );
      // The specific reason is worth seeing, so the dialog stays open with
      // the owner's input intact rather than being dismissed.
      cy.get('[data-cy="promotion-create-dialog"]').should('be.visible');
    });

    it('cancel closes the dialog without calling the server', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.get('[data-cy="promotions-add"]').click();
      cy.get('[data-cy="promotion-create-cancel"]').click();
      cy.get('.p-dialog-mask').should('not.exist');
    });
  });

  describe('deleting a promotion (#1431 PR 2 of 2)', () => {
    it('deletes on confirm and reloads the timeline', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );
      cy.intercept('DELETE', '/api/v1/athletes/1/promotions/9', { statusCode: 204 }).as('delete');

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([])).as('reload');

      cy.get('[data-cy="promotion-delete-9"]').click();
      cy.get('.p-confirmpopup').should('be.visible');
      cy.get('.p-confirmpopup-accept-button').click();

      cy.wait('@delete');
      cy.wait('@reload');
      cy.get('[data-cy="promotions-empty"]').should('be.visible');
    });

    it('does not delete when the confirm popup is rejected', () => {
      cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([promotion()])).as(
        'promotions',
      );
      cy.intercept('DELETE', '/api/v1/athletes/1/promotions/9', { statusCode: 204 }).as('delete');

      cy.visitAuthenticated('/dashboard/athletes/1/promotions');
      cy.wait(['@academy', '@athlete', '@promotions']);

      cy.get('[data-cy="promotion-delete-9"]').click();
      cy.get('.p-confirmpopup-reject-button').click();
      cy.get('@delete.all').should('have.length', 0);
      cy.get('[data-cy="promotion-9"]').should('be.visible');
    });
  });
});

/**
 * The dialog's controls fill their column (#1495).
 *
 * They carried `styleClass="w-full"`, which does nothing to a `p-select`: the
 * only `.w-full` rule in the codebase is nested inside `.p-password`. So five
 * selects in a 26rem dialog sized to their longest belt name and came out
 * ragged — "Purple" wider than "White" — for a reason no reader could see.
 */
describe('the promotion dialog is one column (#1495)', () => {
  it('gives every control the same width', () => {
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE } });
    cy.intercept('GET', '/api/v1/athletes/1/promotions*', promotionsPage([]));
    cy.visitAuthenticated('/dashboard/athletes/1/promotions');

    cy.get('[data-cy="promotions-add"]').click();

    cy.get('[data-cy="promotion-create-dialog"] .p-select')
      .first()
      .then(($first) => {
        const width = $first[0].getBoundingClientRect().width;
        // Every select the same, and none of them content-sized: the dialog
        // is 26rem, so a filled control is comfortably past 300px.
        expect(width, 'a filled select in a 26rem dialog').to.be.greaterThan(300);

        cy.get('[data-cy="promotion-create-dialog"] .p-select').each(($s) => {
          expect($s[0].getBoundingClientRect().width).to.be.closeTo(width, 1);
        });
      });
  });
});
