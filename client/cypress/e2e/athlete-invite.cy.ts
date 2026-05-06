import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const BASE_ATHLETE = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: null,
  phone_national_number: null,
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue' as const,
  stripes: 2,
  status: 'active' as const,
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
  paid_current_month: false,
};

const ATHLETE_NO_INVITATION = { ...BASE_ATHLETE, invitation: null };

const ATHLETE_NO_EMAIL = { ...BASE_ATHLETE, email: null, invitation: null };

const ATHLETE_PENDING = {
  ...BASE_ATHLETE,
  invitation: {
    id: 11,
    state: 'pending' as const,
    sent_at: '2026-05-06T10:00:00Z',
    expires_at: '2026-05-13T10:00:00Z',
    accepted_at: null,
  },
};

const ATHLETE_ACCEPTED = {
  ...BASE_ATHLETE,
  invitation: {
    id: 11,
    state: 'accepted' as const,
    sent_at: '2026-05-06T10:00:00Z',
    expires_at: '2026-05-13T10:00:00Z',
    accepted_at: '2026-05-07T11:30:00Z',
  },
};

describe('Athlete invitation card on athlete detail (#467)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } },
    });
  });

  it('owner can invite an athlete from the detail page; state flips to pending', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_NO_INVITATION },
    }).as('getAthlete');
    cy.intercept('POST', '/api/v1/athletes/42/invite', {
      statusCode: 201,
      body: {
        data: {
          id: 11,
          athlete_id: 42,
          email: 'mario@example.com',
          expires_at: '2026-05-13T10:00:00Z',
          accepted_at: null,
          revoked_at: null,
          last_sent_at: '2026-05-06T10:00:00Z',
          state: 'pending',
        },
      },
    }).as('invite');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-invitation-card"]').should('exist');
    cy.get('[data-cy="athlete-invitation-invite"]').scrollIntoView().should('be.visible').click();

    cy.wait('@invite');
    cy.get('[data-cy="athlete-invitation-pending"]').should('exist');
    cy.get('[data-cy="athlete-invitation-resend"]').should('exist');
    cy.get('[data-cy="athlete-invitation-revoke"]').should('exist');
    cy.contains('Invitation sent').should('be.visible');
  });

  it('renders the no-email empty state when athlete has no email on file', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_NO_EMAIL },
    }).as('getAthlete');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-invitation-no-email"]').should('be.visible');
    cy.get('[data-cy="athlete-invitation-invite"]').should('not.exist');
  });

  it('owner can re-send a pending invitation', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_PENDING },
    }).as('getAthlete');
    cy.intercept('POST', '/api/v1/athletes/42/invite/resend', {
      statusCode: 200,
      body: {
        data: {
          id: 11,
          athlete_id: 42,
          email: 'mario@example.com',
          expires_at: '2026-05-13T10:00:00Z',
          accepted_at: null,
          revoked_at: null,
          last_sent_at: '2026-05-06T11:00:00Z',
          state: 'pending',
        },
      },
    }).as('resend');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-invitation-resend"]').scrollIntoView().should('be.visible').click();
    cy.wait('@resend');
    cy.contains('Invitation re-sent').should('be.visible');
    cy.get('[data-cy="athlete-invitation-pending"]').should('exist');
  });

  it('renders the accepted chip and no actions when invitation is accepted', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_ACCEPTED },
    }).as('getAthlete');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-invitation-accepted"]').should('be.visible');
    cy.get('[data-cy="athlete-invitation-resend"]').should('not.exist');
    cy.get('[data-cy="athlete-invitation-revoke"]').should('not.exist');
    cy.get('[data-cy="athlete-invitation-invite"]').should('not.exist');
  });

  it('surfaces a 422 email_already_registered as an error toast', () => {
    cy.intercept('GET', '/api/v1/athletes/42', {
      statusCode: 200,
      body: { data: ATHLETE_NO_INVITATION },
    }).as('getAthlete');
    cy.intercept('POST', '/api/v1/athletes/42/invite', {
      statusCode: 422,
      body: {
        message: 'The given data was invalid.',
        // Real wire shape — Laravel keys validation errors by field
        // name: errors.email[0] === 'email_already_registered'.
        errors: { email: ['email_already_registered'] },
      },
    }).as('invite');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-invitation-invite"]').scrollIntoView().click();
    cy.wait('@invite');

    cy.contains("Couldn't send the invitation").should('be.visible');
    // Stays in the empty state — no flip to pending.
    cy.get('[data-cy="athlete-invitation-pending"]').should('not.exist');
    cy.get('[data-cy="athlete-invitation-invite"]').should('exist');
  });
});
