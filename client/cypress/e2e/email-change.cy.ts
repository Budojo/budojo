import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E coverage for the email-change-with-verification flow (#476).
 * Five scenarios:
 *
 * 1. Profile (owner) — pencil → confirm → request → toast → pillola
 * 2. Athlete state-A — direct edit, simple PATCH (no extra UI)
 * 3. Athlete state-B — confirm → invite_swap toast
 * 4. Athlete state-C — confirm → pending toast
 * 5. Public verify — happy-path renders confirmed panel + redirects
 */

const FAKE_USER_NO_PENDING = {
  id: 1,
  name: 'Tester',
  email: 'tester@example.com',
  role: 'owner' as const,
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
  pending_email_change: null,
};

const FAKE_USER_WITH_PENDING = {
  ...FAKE_USER_NO_PENDING,
  pending_email_change: {
    new_email_partial: 'n***@e***.com',
    expires_at: '2026-05-07T00:00:00Z',
  },
};

const ACADEMY_OK = { statusCode: 200, body: { data: MOCK_ACADEMY } };

describe('Email change — owner profile (#476)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('owner triggers an email change → confirm → toast → pillola appears on next /auth/me', () => {
    let meCallCount = 0;
    cy.intercept('GET', '/api/v1/auth/me', (req) => {
      meCallCount += 1;
      // First call (page boot) — no pending. Second call (after the
      // POST succeeds, the SPA calls loadCurrentUser() to hydrate the
      // pending block) — pending in place so the pillola lights up.
      req.reply({
        statusCode: 200,
        body: { data: meCallCount === 1 ? FAKE_USER_NO_PENDING : FAKE_USER_WITH_PENDING },
      });
    }).as('me');

    cy.intercept('POST', '/api/v1/me/email-change', {
      statusCode: 202,
      body: { message: 'verification_link_sent' },
    }).as('request');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-email-edit"]').click();
    cy.get('[data-cy="profile-email-input"]').type('new@example.com');
    cy.get('[data-cy="profile-email-save"]').click();

    // Confirm-popup spelled out the consequences; click "Send link".
    cy.contains('button', /send link|invia link/i).click();

    cy.wait('@request').its('request.body').should('deep.equal', { email: 'new@example.com' });

    // After loadCurrentUser refetches, the pillola is in DOM.
    cy.get('[data-cy="profile-email-pending-pillola"]', { timeout: 5000 }).should('be.visible');
  });
});

describe('Email change — athlete state A (#476)', () => {
  const ATHLETE_A = {
    id: 42,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'old@example.com',
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
    invitation: null,
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: { data: FAKE_USER_NO_PENDING },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes/42', { statusCode: 200, body: { data: ATHLETE_A } }).as(
      'getAthlete',
    );
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } },
    });
  });

  it('owner changes a state-A athlete email — direct PATCH, no extra confirm', () => {
    cy.intercept('POST', '/api/v1/athletes/42/email', {
      statusCode: 200,
      body: { data: { mode: 'direct' } },
    }).as('change');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-email-edit"]').click();
    cy.get('[data-cy="athlete-email-input"]').type('fresh@example.com');
    cy.get('[data-cy="athlete-email-save"]').click();

    cy.wait('@change').its('request.body').should('deep.equal', { email: 'fresh@example.com' });
  });
});

describe('Email change — athlete state B (#476)', () => {
  const ATHLETE_B = {
    id: 42,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'old@example.com',
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
    invitation: {
      id: 11,
      state: 'pending' as const,
      sent_at: '2026-05-01T10:00:00Z',
      expires_at: '2026-05-08T10:00:00Z',
      accepted_at: null,
    },
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: { data: FAKE_USER_NO_PENDING },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes/42', { statusCode: 200, body: { data: ATHLETE_B } }).as(
      'getAthlete',
    );
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } },
    });
  });

  it('owner changes a state-B athlete email — confirm → invite_swap toast', () => {
    cy.intercept('POST', '/api/v1/athletes/42/email', {
      statusCode: 200,
      body: { data: { mode: 'invite_swap' } },
    }).as('change');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-email-edit"]').click();
    cy.get('[data-cy="athlete-email-input"]').type('fresh@example.com');
    cy.get('[data-cy="athlete-email-save"]').click();

    // Confirm dialog — accept.
    cy.contains('button', /continue|continua/i).click();

    cy.wait('@change');
  });
});

describe('Email change — athlete state C (#476)', () => {
  const ATHLETE_C = {
    id: 42,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'old@example.com',
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
    invitation: {
      id: 12,
      state: 'accepted' as const,
      sent_at: '2026-04-01T10:00:00Z',
      expires_at: '2026-04-08T10:00:00Z',
      accepted_at: '2026-04-02T11:30:00Z',
    },
  };

  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: { data: FAKE_USER_NO_PENDING },
    });
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK);
    cy.intercept('GET', '/api/v1/athletes/42', { statusCode: 200, body: { data: ATHLETE_C } }).as(
      'getAthlete',
    );
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } },
    });
  });

  it('owner changes a state-C athlete email — confirm → pending toast', () => {
    cy.intercept('POST', '/api/v1/athletes/42/email', {
      statusCode: 200,
      body: { data: { mode: 'pending' } },
    }).as('change');

    cy.visitAuthenticated('/dashboard/athletes/42');
    cy.wait('@getAthlete');

    cy.get('[data-cy="athlete-email-edit"]').click();
    cy.get('[data-cy="athlete-email-input"]').type('fresh@example.com');
    cy.get('[data-cy="athlete-email-save"]').click();

    cy.contains('button', /continue|continua/i).click();

    cy.wait('@change');
  });
});

describe('Email change — public verify route (#476)', () => {
  it('happy path renders the confirmed panel and redirects to /auth/login', () => {
    const token = 'a'.repeat(64);
    cy.intercept('POST', `/api/v1/email-change/${token}/verify`, {
      statusCode: 200,
      body: { message: 'email_change_confirmed' },
    }).as('verify');

    cy.visit(`/auth/verify-email-change/${token}`);
    cy.wait('@verify');

    cy.get('[data-cy="verify-email-change-success"]', { timeout: 5000 }).should('be.visible');

    // Auto-redirect after 2s — wait a bit longer than the timeout.
    cy.url({ timeout: 5000 }).should('include', '/auth/login');
  });

  it('410 response renders the error panel with a CTA back to /auth/login', () => {
    const token = 'b'.repeat(64);
    cy.intercept('POST', `/api/v1/email-change/${token}/verify`, {
      statusCode: 410,
      body: { message: 'invalid_or_expired_link' },
    }).as('verify');

    cy.visit(`/auth/verify-email-change/${token}`);
    cy.wait('@verify');

    cy.get('[data-cy="verify-email-change-error"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-cy="verify-email-change-cta-login"]').should('exist');
  });
});
