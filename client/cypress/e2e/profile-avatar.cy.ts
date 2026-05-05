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
  avatar_url: '/storage/users/avatars/1.jpg',
};

describe('user avatar — upload + replace + remove (#411)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: USER_NO_AVATAR } }).as(
      'me',
    );
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
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
