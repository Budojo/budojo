export {};

const ACADEMY = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: null,
  logo_url: null,
};

const USER_NO_AVATAR = {
  id: 1,
  name: 'Mario Rossi',
  email: 'mario@example.com',
  email_verified_at: '2026-01-01T00:00:00Z',
  avatar_url: null,
  deletion_pending: null,
};

const USER_WITH_AVATAR = {
  ...USER_NO_AVATAR,
  // The `?v=...` query string is the server's cache-buster (see the
  // `getAvatarUrlAttribute` accessor on the User model). Tests pin the
  // first version here; the replace test below ships a different `?v=`
  // to assert the SPA actually re-renders rather than serving the old
  // bitmap from cache.
  avatar_url: '/storage/users/avatars/1.png?v=1700000000',
};

const USER_WITH_REPLACED_AVATAR = {
  ...USER_NO_AVATAR,
  avatar_url: '/storage/users/avatars/1.png?v=1700000060',
};

// 1x1 transparent PNG — used to satisfy <img> requests so the
// component's (error) → initials-fallback path doesn't trip on test
// mocks that point at fictional URLs.
const ONE_PIXEL_PNG = Cypress.Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf' +
    'c0c0c0c0c0c000000007fc01c2dd1eaf3f0000000049454e44ae426082',
  'hex',
);

describe('user avatar — upload + replace + remove (#411)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: USER_NO_AVATAR } }).as(
      'me',
    );
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    // Stub the storage URL so the <img>'s GET resolves with a real
    // bitmap. Without this, the browser would 404 the fictional
    // /storage/... path and the component's (error) handler would
    // swap to the initials fallback before the test's assertions.
    cy.intercept('GET', '/storage/users/avatars/**', {
      statusCode: 200,
      headers: { 'Content-Type': 'image/png' },
      body: ONE_PIXEL_PNG,
    });
  });

  it('shows the initials fallback when the user has no avatar', () => {
    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-avatar-card"]').should('exist');
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-initials"]').should(
      'contain.text',
      'MR',
    );
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]').should('not.exist');
    cy.get('[data-cy="profile-avatar-upload"]').should('contain.text', 'Upload');
    cy.get('[data-cy="profile-avatar-remove"]').should('not.exist');
  });

  it('uploads an avatar and renders the returned image + topbar chip', () => {
    cy.intercept('POST', '/api/v1/me/avatar', {
      statusCode: 200,
      body: { data: USER_WITH_AVATAR },
    }).as('upload');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@me');

    cy.get('[data-cy="profile-avatar-input"]').selectFile(
      {
        contents: Cypress.Buffer.from('PNGSTUB'),
        fileName: 'me.png',
        mimeType: 'image/png',
      },
      { force: true },
    );

    cy.wait('@upload');
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]')
      .should('exist')
      .and('have.attr', 'src', USER_WITH_AVATAR.avatar_url);
    cy.get('[data-cy="profile-avatar-upload"]').should('contain.text', 'Replace');
    cy.get('[data-cy="profile-avatar-remove"]').should('exist');

    // Topbar chip reflects the new avatar — only visible below 768px,
    // so resize the viewport to a phone width before asserting.
    cy.viewport(390, 844);
    cy.get('[data-cy="topbar-user-avatar"] [data-cy="user-avatar-image"]')
      .should('exist')
      .and('have.attr', 'src', USER_WITH_AVATAR.avatar_url);
  });

  it('replaces an existing avatar — same path, new ?v= cache-bust', () => {
    // Replace is the risky branch: the server keeps `users/avatars/{id}.png`
    // identical and bumps the URL only via the cache-buster query param.
    // Without the `?v=...` change, the SPA's <img> would happily keep
    // serving the old bitmap from cache and the user would see no
    // visible update. This pins the SPA's contract: it renders whatever
    // URL the server hands back, so a same-path-different-?v response
    // really does swap the rendered image.
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: { data: USER_WITH_AVATAR },
    }).as('meWithAvatar');
    cy.intercept('POST', '/api/v1/me/avatar', {
      statusCode: 200,
      body: { data: USER_WITH_REPLACED_AVATAR },
    }).as('replace');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@meWithAvatar');

    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]')
      .should('exist')
      .and('have.attr', 'src', USER_WITH_AVATAR.avatar_url);

    cy.get('[data-cy="profile-avatar-input"]').selectFile(
      {
        contents: Cypress.Buffer.from('REPLACEDPNG'),
        fileName: 'new.png',
        mimeType: 'image/png',
      },
      { force: true },
    );

    cy.wait('@replace');
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]')
      .should('exist')
      .and('have.attr', 'src', USER_WITH_REPLACED_AVATAR.avatar_url);
  });

  it('removes an avatar via the confirm popup', () => {
    cy.intercept('GET', '/api/v1/auth/me', {
      statusCode: 200,
      body: { data: USER_WITH_AVATAR },
    }).as('meWithAvatar');
    cy.intercept('DELETE', '/api/v1/me/avatar', {
      statusCode: 200,
      body: { data: USER_NO_AVATAR },
    }).as('removeAvatar');

    cy.visitAuthenticated('/dashboard/profile');
    cy.wait('@meWithAvatar');

    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]').should('exist');
    cy.get('[data-cy="profile-avatar-remove"]').click();
    // Scope to the confirm popup so we don't match the trigger button
    // ("Remove" appears on both the card action AND the popup accept).
    cy.get('.p-confirmpopup-accept-button').click();
    cy.wait('@removeAvatar');
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-image"]').should('not.exist');
    cy.get('[data-cy="profile-avatar-preview"] [data-cy="user-avatar-initials"]').should(
      'contain.text',
      'MR',
    );
  });
});
