/// <reference types="cypress" />

import { VIEWPORT_IPHONE_SE } from '../support/viewports';

// Social-native notifications page (#1129). All API calls are stubbed —
// a full paginated envelope on the catch-all so paginated shell pages
// (feed, etc.) don't choke on a missing `meta.current_page`, then the
// specific `/auth/me` + `/me/notifications` stubs win (last-registered).

const athleteMe = {
  statusCode: 200,
  body: {
    data: {
      id: 2,
      first_name: 'Alice',
      last_name: 'User',
      full_name: 'Alice User',
      handle: 'alicebjj',
      email: 'athlete@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
      role: 'athlete',
    },
  },
};

const inbox = {
  statusCode: 200,
  body: {
    data: [
      {
        id: '1',
        type: 'x',
        kind: 'community_reaction_on_your_post',
        title: 'Marco Rossi reacted to your post',
        body: '',
        link: '/dashboard/me/feed',
        actor: { name: 'Marco Rossi', avatar_url: null },
        read_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'x',
        kind: 'weekly_recap',
        title: 'Your weekly recap',
        body: '3 sessions this week',
        link: '/dashboard/me/recap/2026-05-18',
        actor: null,
        read_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
    ],
    meta: { unread_count: 1 },
  },
};

const emptyPage = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Notifications page (#1129)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/**', emptyPage);
    cy.intercept('GET', '/api/v1/me/notifications*', inbox).as('inbox');
    cy.intercept('GET', '/api/v1/auth/me*', athleteMe);
  });

  it('renders grouped rich rows — unread under "new", actorless as a type tile', () => {
    cy.visitAuthenticated('/dashboard/me/notifications');
    cy.wait('@inbox');

    cy.get('[data-cy="notifications-group-new"]').should('be.visible');
    cy.get('[data-cy="notification-1"]').should('be.visible');
    cy.get('[data-cy="notification-2"] .notification__tile').should('exist');
  });

  it('archives a notification, offers it back, and keeps it under Archiviate (#1914)', () => {
    cy.intercept('POST', '/api/v1/me/notifications/*/archive', {
      statusCode: 200,
      body: { data: { id: '2', archived_at: '2026-09-26T10:00:00+00:00' } },
    }).as('archive');
    cy.intercept('POST', '/api/v1/me/notifications/*/unarchive', {
      statusCode: 200,
      body: { data: { id: '2', archived_at: null } },
    }).as('unarchive');

    cy.visitAuthenticated('/dashboard/me/notifications');
    cy.wait('@inbox');

    cy.get('[data-cy="notification-archive-2"]').click();
    cy.wait('@archive').its('request.url').should('contain', '/notifications/2/archive');
    cy.get('[data-cy="notification-2"]').should('not.exist');

    // Undo, not a confirmation: it goes straight back.
    cy.get('[data-cy="notifications-undo"]').should('contain.text', 'Notification archived');
    cy.get('[data-cy="notifications-undo-action"]').click();
    cy.wait('@unarchive');
    cy.wait('@inbox');
  });

  it('lists the archived ones on their own tab', () => {
    cy.intercept('GET', '/api/v1/me/notifications?archived=1', {
      statusCode: 200,
      body: {
        data: [
          {
            id: '9',
            type: 'x',
            kind: 'owner_athlete_missed_streak',
            title: "Giorgi Giorgio non si allena da un po'",
            body: '',
            link: null,
            actor: null,
            read_at: '2026-09-20T10:00:00+00:00',
            archived_at: '2026-09-21T10:00:00+00:00',
            created_at: '2026-09-20T09:00:00+00:00',
          },
        ],
        meta: { unread_count: 0 },
      },
    }).as('archived');

    cy.visitAuthenticated('/dashboard/me/notifications');
    cy.wait('@inbox');

    cy.get('[data-cy="notifications-filter-archived"]').click();
    cy.wait('@archived');
    cy.get('[data-cy="notification-9"]').should('contain.text', 'Giorgi Giorgio');
    cy.get('[data-cy="notification-unarchive-9"]').should('exist');
  });

  it('marks all as read from the header CTA', () => {
    cy.intercept('POST', '/api/v1/me/notifications/read-all', {
      statusCode: 200,
      body: { data: { marked_read: 1 } },
    }).as('readAll');

    cy.visitAuthenticated('/dashboard/me/notifications');
    cy.wait('@inbox');
    cy.get('[data-cy="notifications-mark-all"]').click();
    cy.wait('@readAll');
  });

  it('the topbar bell navigates to the notifications page', () => {
    // The bell lives in the mobile topbar (the desktop shell uses the side
    // rail), so assert it at a phone viewport where it's genuinely visible —
    // no force-click escape hatch needed.
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    cy.visitAuthenticated('/dashboard/me/feed');
    cy.get('[data-cy="notification-bell"]').should('be.visible').click();
    cy.url().should('include', '/dashboard/me/notifications');
  });
});
