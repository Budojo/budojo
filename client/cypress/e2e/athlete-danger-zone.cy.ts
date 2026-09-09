import { MOCK_ACADEMY } from '../support/fixtures';

// Delete moved off the roster and onto a danger zone at the bottom of the
// athlete's edit page (#1430) — the GitHub repository-settings pattern.
// Reaching the button now requires choosing THIS athlete and opening THEIR
// page first, which is the ambiguity a list row carried and this closes.

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

const ATHLETE_MARIO = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue' as const,
  stripes: 2,
  status: 'active' as const,
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  is_self: false,
};

const ATHLETE_SELF = {
  ...ATHLETE_MARIO,
  id: 43,
  first_name: 'Owner',
  last_name: 'User',
  is_self: true,
};

const EMPTY_ATHLETES = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Athlete danger zone (#1430)', () => {
  beforeEach(() => {
    // Catch-all FIRST, per the repo's own recipe (docs/development/visual-
    // verification.md): every route the dashboard shell calls on init
    // (notifications, documents/expiring, attendance summary, …) needs an
    // answer or the fake `visitAuthenticated` token — genuinely invalid,
    // never a real backend-issued one — gets a real 401 back whenever a
    // live `budojo_api` sits under the dev-server proxy, and the auth
    // interceptor logs out on any 401 it sees while a token is set. CI's
    // backend-less proxy fails these the same calls fast enough that this
    // never bit there; a live local stack makes it a real result, not
    // noise, which is what surfaced it.
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
  });

  it('reads as one deliberate block at both widths (#1486)', () => {
    // It looked unfinished: on a wide window `space-between` pushed the button
    // to the far edge with the paragraph stretched across everything between
    // them, and on a narrow one a small outlined button floated under two
    // lines of grey text.
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_MARIO },
    }).as('getAthlete');
    cy.intercept('GET', '/api/v1/athletes?*', EMPTY_ATHLETES);
    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait(['@academy', '@getAthlete']);
    cy.get('[data-cy="athlete-danger-zone"]').scrollIntoView();

    // Wide: copy and button share a line, and the copy keeps a readable
    // measure rather than running the full width of the card.
    cy.viewport(1280, 800);
    cy.get('[data-cy="athlete-danger-zone"] .danger-zone__copy').then(($copy) => {
      const copy = $copy[0].getBoundingClientRect();
      cy.get('[data-cy="danger-zone-delete-btn"]').then(($btn) => {
        const btn = $btn[0].getBoundingClientRect();
        expect(btn.top, "button shares the copy's line").to.be.lessThan(copy.bottom);
        expect(copy.width, 'copy is capped to a readable measure').to.be.lessThan(600);
      });
    });

    // Narrow: the button takes the full row, so it reads as the block's one
    // action rather than as something left over.
    cy.viewport(500, 800);
    cy.get('[data-cy="athlete-danger-zone"] .danger-zone__row').then(($row) => {
      const row = $row[0].getBoundingClientRect();
      cy.get('[data-cy="danger-zone-delete-btn"]').then(($btn) => {
        expect($btn[0].getBoundingClientRect().width).to.be.greaterThan(row.width * 0.9);
      });
    });
  });

  it('deletes on confirm, toasts, and returns to the roster', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_MARIO },
    }).as('getAthlete');
    cy.intercept('DELETE', '/api/v1/athletes/42', { statusCode: 204 }).as('deleteAthlete');
    cy.intercept('GET', '/api/v1/athletes?*', EMPTY_ATHLETES);

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait(['@academy', '@getAthlete']);

    cy.get('[data-cy="athlete-danger-zone"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="danger-zone-delete-btn"]').click();

    // The confirm popup names the athlete AND states the document cascade —
    // not a generic "are you sure?". Same wording the roster's own delete
    // used, because moving the button didn't change the fact it states.
    cy.get('.p-confirmpopup').should('be.visible').and('contain.text', 'Mario Rossi');
    cy.get('.p-confirmpopup').and('contain.text', 'documents');
    cy.get('.p-confirmpopup-accept-button').click();

    cy.wait('@deleteAthlete');
    // The toast is already covered precisely in the unit spec (exact
    // message-service call, severity, content) — chasing its exact 3s
    // fade window here would be a race, not a check. What this level
    // proves is the thing the unit spec can't: the real navigation away
    // from a page that now refers to nothing.
    cy.url().should('match', /\/dashboard\/athletes$/);
  });

  it('does not delete when the confirm popup is cancelled', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_MARIO },
    }).as('getAthlete');
    cy.intercept('DELETE', '/api/v1/athletes/42', { statusCode: 204 }).as('deleteAthlete');

    cy.visitAuthenticated('/dashboard/athletes/42/edit');
    cy.wait(['@academy', '@getAthlete']);

    cy.get('[data-cy="danger-zone-delete-btn"]').click();
    cy.get('.p-confirmpopup-reject-button').click();
    cy.get('.p-confirmpopup').should('not.exist');
    cy.get('@deleteAthlete.all').should('have.length', 0);
    // Rejecting stays on the edit page — the button is right where it was.
    cy.get('[data-cy="danger-zone-delete-btn"]').should('be.visible');
  });

  it('hides the delete button on the owner’s own self-row and points to Profile instead (#747)', () => {
    cy.intercept('GET', '/api/v1/athletes/43', {
      statusCode: 200,
      body: { data: ATHLETE_SELF },
    }).as('getAthlete');

    cy.visitAuthenticated('/dashboard/athletes/43/edit');
    cy.wait(['@academy', '@getAthlete']);

    // DeleteAthleteAction rejects a self-row with a 403 — no confirm-gated
    // button that is guaranteed to fail renders here at all.
    cy.get('[data-cy="danger-zone-delete-btn"]').should('not.exist');
    cy.get('[data-cy="danger-zone-self-note"]')
      .scrollIntoView()
      .should('be.visible')
      .and('contain.text', 'Profile');
  });

  it('no longer offers delete anywhere on the roster itself', () => {
    cy.intercept('GET', '/api/v1/athletes?*', {
      statusCode: 200,
      body: {
        data: [ATHLETE_MARIO],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
      },
    }).as('athletes');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait(['@academy', '@athletes']);

    // Desktop row: edit stays, delete is gone.
    cy.get('[data-cy="edit-btn"]').should('be.visible');
    cy.get('[data-cy="delete-btn"]').should('not.exist');

    // Mobile card 3-dot menu never lists it either.
    cy.viewport(390, 844);
    cy.get('[data-cy="athlete-card-menu-42"]').click();
    cy.get('.p-menu-list').should('be.visible').and('not.contain.text', 'Delete');
  });
});
