import { MOBILE_VIEWPORTS } from '../support/viewports';
import { expectNoSidewaysScroll } from '../support/no-sideways-scroll';

/**
 * Public account-deletion pages — `/account-deletion` is the canonical
 * English (#688), `/account-deletion/it` is the lock-step Italian
 * translation. Both routes are unauthenticated — the page is referenced
 * from the Play Store listing (the reviewer visits it during policy
 * review) and from the deletion-confirmation email's CTA.
 *
 * Each page pins:
 *   - title + version stamp at the bottom
 *   - language toggle row
 *   - `mailto:privacy@budojo.it` for questions about the software
 *   - the data folder an uninstall leaves behind (#1255: no server account)
 *   - back-home CTA navigates to /
 *   - layout fits on every mobile viewport (no horizontal overflow)
 */

describe('Account deletion — canonical English /account-deletion (#688)', () => {
  beforeEach(() => {
    cy.visit('/account-deletion');
  });

  it('renders the English title and the version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', 'Account deletion');
    cy.get('[data-cy="account-deletion-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Version')
      .and('contain.text', '2026-11-09');
  });

  it('language toggle links to the Italian translation', () => {
    cy.get('[data-cy="account-deletion-lang-toggle"] [data-cy="account-deletion-lang-it"]').should(
      'have.attr',
      'href',
      '/account-deletion/it',
    );
  });

  it('keeps the privacy mailbox for questions about the software', () => {
    cy.get('a[href="mailto:privacy@budojo.it"]').should('exist');
  });

  it('names the data folder that an uninstall leaves behind (#1255)', () => {
    cy.contains('There is no Budojo account to close').should('exist');
    cy.contains('code', '%APPDATA%\\Budojo\\').should('exist');
    cy.contains('Uninstalling does not touch it').should('exist');
  });

  it('cross-links to the privacy policy so the chain stays auditable', () => {
    cy.get('a[routerlink="/privacy"]').should('exist');
  });

  it('the back-home CTA navigates to / (the public landing since #330)', () => {
    cy.get('[data-cy="account-deletion-home"]').click();
    cy.location('pathname').should('eq', '/');
  });
});

describe('Account deletion — Italian /account-deletion/it (#688)', () => {
  beforeEach(() => {
    cy.visit('/account-deletion/it');
  });

  it('renders the Italian title and the version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', "Cancellazione dell'account");
    cy.get('[data-cy="account-deletion-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Versione')
      .and('contain.text', '2026-11-09');
  });

  it('language toggle links back to the canonical /account-deletion', () => {
    cy.get('[data-cy="account-deletion-lang-toggle"] [data-cy="account-deletion-lang-en"]').should(
      'have.attr',
      'href',
      '/account-deletion',
    );
  });

  it('names the data folder in Italian (#1255)', () => {
    cy.contains("Non c'è un account Budojo da chiudere").should('exist');
    cy.contains('code', '%APPDATA%\\Budojo\\').should('exist');
  });

  it('the back-home CTA navigates to / (the public landing since #330)', () => {
    cy.get('[data-cy="account-deletion-home"]').click();
    cy.location('pathname').should('eq', '/');
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Account deletion fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
    });

    // Both language versions must fit. The high-yield assertion against
    // documentElement.scrollWidth catches a long mailto or an
    // unbreakable bullet that pushes the body wider than the viewport
    // — CSS `text-overflow: ellipsis` would silently hide that
    // regression (see lesson from PR #239 review on the privacy page).
    for (const path of ['/account-deletion', '/account-deletion/it']) {
      it(`${path} does not overflow horizontally`, () => {
        cy.visit(path);
        // A lazy route: measured before it renders, the empty shell would fit.
        cy.get('h1').should('be.visible');
        expectNoSidewaysScroll('public');
      });
    }
  });
});
