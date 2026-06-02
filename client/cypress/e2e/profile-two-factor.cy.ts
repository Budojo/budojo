import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * E2E coverage for the "Two-factor authentication" panel on
 * `/dashboard/profile` (#412). Walks the three states (off → pending
 * → active) plus the disable round-trip. All HTTP intercepted — no
 * real backend, no real TOTP library.
 */

const FAKE_USER = {
  id: 1,
  first_name: 'Tester',
  last_name: 'McTest',
  full_name: 'Tester McTest',
  handle: null,
  email: 'tester@example.com',
  role: 'owner' as const,
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
  pending_email_change: null,
};

const STATUS_OFF = { enabled: false, pending: false, recovery_codes_remaining: 0 };
const STATUS_ACTIVE = { enabled: true, pending: false, recovery_codes_remaining: 8 };

describe('Two-factor authentication panel (#412)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Catch-all FIRST so no unmocked background GET (e.g. the notification
    // bell's /me/notifications poll, #729) reaches the dev backend, 401s on
    // the fake token, and trips the auth-interceptor redirect to /auth/login
    // before the security panel renders. Specific stubs are registered after,
    // so they win (Cypress resolves most-recently-defined).
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: FAKE_USER } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // Sibling-panel intercepts. Without these the dev-server proxy
    // gets a real request, the page paints with errored panels, and
    // the resulting layout shifts can race with our click below.
    cy.intercept('GET', '/api/v1/me/sessions', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/login-history', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/me/notification-preferences', {
      statusCode: 200,
      body: { data: {} },
    });
  });

  it('renders the "Enable" CTA when 2FA is off', () => {
    cy.intercept('GET', '/api/v1/me/two-factor', {
      statusCode: 200,
      body: { data: STATUS_OFF },
    }).as('status');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@status');

    cy.get('[data-cy="profile-two-factor"]').scrollIntoView();
    cy.get('[data-cy="profile-two-factor-off"]').should('be.visible');
    cy.get('[data-cy="profile-two-factor-enable"]').should('be.visible');
  });

  it('enrols, confirms, and surfaces the recovery codes dialog', () => {
    cy.intercept('GET', '/api/v1/me/two-factor', {
      statusCode: 200,
      body: { data: STATUS_OFF },
    }).as('status');
    cy.intercept('POST', '/api/v1/me/two-factor/enrol', {
      statusCode: 200,
      body: {
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          provisioning_uri: 'otpauth://totp/Budojo:tester@example.com?secret=JBSWY3DPEHPK3PXP',
        },
      },
    }).as('enrol');
    cy.intercept('POST', '/api/v1/me/two-factor/confirm', {
      statusCode: 200,
      body: { data: { recovery_codes: ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'] } },
    }).as('confirm');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@status');
    cy.get('[data-cy="profile-two-factor-enable"]').scrollIntoView();
    cy.get('[data-cy="profile-two-factor-enable"] button').click();
    cy.wait('@enrol');

    cy.get('[data-cy="profile-two-factor-secret"]').should('contain.text', 'JBSWY3DPEHPK3PXP');
    // The QR <img> is gated on a dynamic `import('qrcode')` (#877). qrcode
    // is CommonJS: under the esbuild prod build (and a cold vite
    // dep-optimize on CI's first lazy load) the import namespace only
    // carries `default`, so the old `mod.toDataURL` was undefined, threw,
    // and the component's silent `.catch` left the QR unrendered — only a
    // warm local vite (synthesized named exports) papered over it. The
    // component now reaches through `mod.default`, so the QR renders
    // everywhere. Timeout kept modest for CI page-load variance.
    cy.get('[data-cy="profile-two-factor-qr"]', { timeout: 10000 }).should('be.visible');

    // After confirm the status refresh fires — return the active state.
    cy.intercept('GET', '/api/v1/me/two-factor', {
      statusCode: 200,
      body: { data: STATUS_ACTIVE },
    }).as('statusActive');

    cy.get('[data-cy="profile-two-factor-code-input"]').type('123456');
    cy.get('[data-cy="profile-two-factor-confirm-submit"] button').click();
    cy.wait('@confirm');
    cy.wait('@statusActive');

    // PrimeNG dialog renders the actual content portal'd to <body>
    // — the `<p-dialog>` host carries data-cy but has 0×0 dimensions;
    // assert via the codes block which lives inside the rendered panel.
    cy.get('[data-cy="profile-two-factor-recovery-codes"]', { timeout: 8000 })
      .should('contain.text', 'AAAA-1111')
      .and('be.visible');
    cy.get('[data-cy="profile-two-factor-recovery-dismiss"] button').click();

    // After dismissing the dialog, the active state renders. The
    // outer panel can sit below a parent with `overflow: hidden`
    // (profile-page card chrome), so `be.visible` against the host
    // is brittle. Asserting on the regenerate CTA — a nested child
    // that lives well inside the panel — is the durable signal.
    cy.get('[data-cy="profile-two-factor-active"]').should('exist');
    cy.get('[data-cy="profile-two-factor-regenerate"]').scrollIntoView().should('be.visible');
  });

  it('shows an inline error when the confirm code is wrong', () => {
    cy.intercept('GET', '/api/v1/me/two-factor', {
      statusCode: 200,
      body: { data: STATUS_OFF },
    }).as('status');
    cy.intercept('POST', '/api/v1/me/two-factor/enrol', {
      statusCode: 200,
      body: {
        data: { secret: 'JBSWY3DPEHPK3PXP', provisioning_uri: 'otpauth://totp/Budojo:x' },
      },
    }).as('enrol');
    cy.intercept('POST', '/api/v1/me/two-factor/confirm', {
      statusCode: 422,
      body: { message: 'The given data was invalid.', errors: { code: ['invalid_totp'] } },
    }).as('confirm');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@status');
    cy.get('[data-cy="profile-two-factor-enable"]').scrollIntoView();
    cy.get('[data-cy="profile-two-factor-enable"] button').click();
    cy.wait('@enrol');
    cy.get('[data-cy="profile-two-factor-code-input"]').type('000000');
    cy.get('[data-cy="profile-two-factor-confirm-submit"] button').click();
    cy.wait('@confirm');

    // The inline error sits below the input and can be clipped by
    // a parent overflow style on narrow viewports. Asserting on
    // existence + content is the durable shape; `be.visible` is the
    // false-positive guard that doesn't help here.
    cy.get('[data-cy="profile-two-factor-code-error"]').should('exist');
  });

  it('renders the active state with regenerate + disable actions when 2FA is on', () => {
    cy.intercept('GET', '/api/v1/me/two-factor', {
      statusCode: 200,
      body: { data: STATUS_ACTIVE },
    }).as('status');

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-tab-security"]').click();
    cy.wait('@status');

    cy.get('[data-cy="profile-two-factor-active"]').scrollIntoView().should('be.visible');
    cy.get('[data-cy="profile-two-factor-regenerate"]').should('be.visible');
    cy.get('[data-cy="profile-two-factor-disable"]').should('be.visible');
  });
});

describe('Login 2FA challenge (#412)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('flips to the 2FA step on 422 and signs in on a valid code', () => {
    // First attempt — server demands a code.
    cy.intercept('POST', '/api/v1/auth/login', (req) => {
      if (typeof req.body === 'object' && req.body !== null && 'two_factor_code' in req.body) {
        req.reply({
          statusCode: 200,
          body: { data: { id: 1, role: 'owner' }, token: 'fake-token' },
        });
        return;
      }
      req.reply({ statusCode: 422, body: { message: 'two_factor_required' } });
    }).as('login');
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          first_name: 'Tester',
          last_name: 'McTest',
          full_name: 'Tester McTest',
          handle: null,
          email: 'tester@example.com',
          role: 'owner',
          email_verified_at: '2026-01-01T00:00:00Z',
          avatar_url: null,
          deletion_pending: null,
          pending_email_change: null,
        },
      },
    });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });

    cy.visit('/auth/login');
    cy.get('#email').type('tester@example.com');
    cy.get('input#password').type('Password1!');
    cy.get('[data-cy="auth-login-submit"] button').click();
    cy.wait('@login');

    cy.get('[data-cy="auth-login-two-factor-step"]').should('be.visible');
    cy.get('[data-cy="auth-login-two-factor-code"]').type('123456');
    cy.get('[data-cy="auth-login-submit"] button').click();
    cy.wait('@login');

    cy.url().should('include', '/dashboard');
  });
});
