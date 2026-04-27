export {};

const ACADEMY_NO_LOGO = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: {
    line1: 'Via Roma 1',
    line2: null,
    city: 'Torino',
    postal_code: '10100',
    province: 'TO',
    country: 'IT',
  },
  logo_url: null,
};

const ACADEMY_WITH_LOGO = {
  ...ACADEMY_NO_LOGO,
  logo_url: '/storage/academy-logos/1/logo.png',
};

describe('academy logo management', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY_NO_LOGO } }).as(
      'academy',
    );
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('shows the empty placeholder when the academy has no logo', () => {
    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-logo-card"]').should('exist');
    cy.get('[data-cy="academy-logo-image"]').should('not.exist');
    cy.get('[data-cy="academy-logo-upload"]').should('contain.text', 'Upload');
    cy.get('[data-cy="academy-logo-remove"]').should('not.exist');
  });

  it('uploads a logo and renders the returned image', () => {
    cy.intercept('POST', '/api/v1/academy/logo', {
      statusCode: 200,
      body: { data: ACADEMY_WITH_LOGO },
    }).as('upload');

    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academy');

    cy.get('[data-cy="academy-logo-input"]').selectFile(
      {
        contents: Cypress.Buffer.from('PNGSTUB'),
        fileName: 'logo.png',
        mimeType: 'image/png',
      },
      { force: true },
    );

    cy.wait('@upload');
    cy.get('[data-cy="academy-logo-image"]')
      .should('exist')
      .and('have.attr', 'src', ACADEMY_WITH_LOGO.logo_url);
    cy.get('[data-cy="academy-logo-upload"]').should('contain.text', 'Replace');
    cy.get('[data-cy="academy-logo-remove"]').should('exist');
  });

  it('removes a logo via the confirm popup', () => {
    cy.intercept('GET', '/api/v1/academy', {
      statusCode: 200,
      body: { data: ACADEMY_WITH_LOGO },
    }).as('academyWithLogo');
    cy.intercept('DELETE', '/api/v1/academy/logo', {
      statusCode: 200,
      body: { data: ACADEMY_NO_LOGO },
    }).as('removeLogo');

    cy.visitAuthenticated('/dashboard/academy');
    cy.wait('@academyWithLogo');

    cy.get('[data-cy="academy-logo-image"]').should('exist');
    cy.get('[data-cy="academy-logo-remove"]').click();
    // Scope to the confirm popup so we don't match the trigger button
    // ("Remove" appears on both the card action AND the popup accept).
    cy.get('.p-confirmpopup-accept-button').click();
    cy.wait('@removeLogo');
    cy.get('[data-cy="academy-logo-image"]').should('not.exist');
  });
});
