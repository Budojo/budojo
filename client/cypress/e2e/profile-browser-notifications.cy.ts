/**
 * Profile → Browser notifications panel (#694). Walks the four
 * server-driven render branches the panel collapses into a single
 * @switch:
 *
 *   - 'server-disabled' → meta.enabled = false
 *   - 'off'             → meta.enabled = true + empty device list
 *   - 'on'              → meta.enabled = true + ≥ 1 device
 *
 * The 'unsupported' branch (browser lacks SwPush + PushManager) and
 * the 'permission-denied' branch (Notification.permission === 'denied')
 * are pure-UI states that aren't backend-driven; vitest covers both.
 *
 * The actual `PushManager.subscribe()` call isn't exercised here —
 * Cypress runs in a real Chromium but the ngx Service Worker is
 * disabled in dev mode (see `provideServiceWorker({ enabled:
 * !isDevMode() })`), and stubbing the vendor push service per spec is
 * cost without value when the WebPushService unit spec already pins
 * the subscribe + error-mapping flow.
 */
describe('Profile → Browser notifications (#694)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Auth + dashboard-shell intercepts the route depends on (mirrors
    // the pattern in `profile-notifications.cy.ts`).
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: {
        data: {
          id: 1,
          first_name: 'Luigi',
          last_name: 'Bianchi',
          full_name: 'Luigi Bianchi',
          email: 'luigi@example.it',
          email_verified_at: '2026-01-01T00:00:00Z',
          has_academy: true,
          handle: 'luigi',
          avatar_url: null,
          language: 'en',
          two_factor_enabled: false,
          notification_preferences: {},
          onboarding_dismissed: true,
          terms_accepted_at: '2025-01-01T00:00:00+00:00',
        },
      },
    });
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: { id: 1, name: 'Academy Gracie Milano' } },
    });
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // Default empty responses for the other profile sub-components so
    // the page renders without console noise.
    cy.intercept('GET', '/api/v1/me/notification-preferences', { data: {} });
    cy.intercept('GET', '/api/v1/me/sessions', { data: [] });
    cy.intercept('GET', '/api/v1/me/login-history', { data: [] });
    cy.intercept('GET', '/api/v1/me/api-tokens', { data: [] });
    cy.intercept('GET', '/api/v1/me/two-factor', { data: { enabled: false } });
  });

  it('renders the "server-disabled" notice when meta.enabled is false', () => {
    cy.intercept('GET', '/api/v1/me/push-subscriptions', {
      data: [],
      meta: { vapid_public_key: null, enabled: false },
    });

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-browser-notifications"]').should('be.visible');
    cy.get('[data-cy="profile-browser-notifications-server-disabled"]').should('be.visible');
  });

  it('renders the "off" CTA when the backend reports an empty device list + VAPID set', () => {
    cy.intercept('GET', '/api/v1/me/push-subscriptions', {
      data: [],
      meta: { vapid_public_key: 'BN9aEK', enabled: true },
    });

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-browser-notifications-off"]').should('be.visible');
    cy.get('[data-cy="profile-browser-notifications-enable"]').should('be.visible');
  });

  it('renders the device list when subscriptions exist', () => {
    cy.intercept('GET', '/api/v1/me/push-subscriptions', {
      data: [
        {
          id: 42,
          endpoint_host: 'fcm.googleapis.com',
          last_seen_at: null,
          created_at: '2026-05-14T07:00:00+00:00',
        },
      ],
      meta: { vapid_public_key: 'BN9aEK', enabled: true },
    });

    cy.visitAuthenticated('/dashboard/profile');
    cy.get('[data-cy="profile-browser-notifications-on"]').should('be.visible');
    cy.get('[data-cy="profile-browser-notifications-device-42"]').should('be.visible');
    cy.get('[data-cy="profile-browser-notifications-revoke-42"]').should('be.visible');
  });
});
