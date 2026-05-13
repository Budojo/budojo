import { MOBILE_VIEWPORTS } from '../support/viewports';

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
 *   - `mailto:privacy@budojo.it` as the canonical request channel
 *   - explicit 30-day grace window mention
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
      .and('contain.text', '2026-05-13');
  });

  it('language toggle links to the Italian translation', () => {
    cy.get('[data-cy="account-deletion-lang-toggle"] [data-cy="account-deletion-lang-it"]').should(
      'have.attr',
      'href',
      '/account-deletion/it',
    );
  });

  it('surfaces the privacy mailbox as the canonical request channel', () => {
    cy.get('a[href="mailto:privacy@budojo.it"]').should('exist');
  });

  it('states the 30-day grace window for the Play reviewer to audit', () => {
    cy.contains('30 days').should('exist');
    cy.contains(/grace/i).should('exist');
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
      .and('contain.text', '2026-05-13');
  });

  it('language toggle links back to the canonical /account-deletion', () => {
    cy.get('[data-cy="account-deletion-lang-toggle"] [data-cy="account-deletion-lang-en"]').should(
      'have.attr',
      'href',
      '/account-deletion',
    );
  });

  it('states the 30-day grace window in Italian', () => {
    cy.contains('30 giorni').should('exist');
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
        cy.document().then((doc) => {
          const root = doc.documentElement;
          expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
        });
      });
    }
  });
});
