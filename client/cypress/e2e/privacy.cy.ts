import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * Public privacy-policy pages — `/privacy` is canonical English (#291),
 * `/privacy/it` is the faithful Italian translation kept in lock-step
 * for IT customers + the Garante. Both routes are unauthenticated —
 * a prospect must be able to read either before they tick the consent
 * box during registration.
 *
 * Each page pins:
 *   - title + draft-status banner + version stamp
 *   - back-home CTA navigates to the root
 *   - cross-link to /sub-processors
 *   - layout fits on every mobile viewport (no horizontal overflow)
 *
 * Layout overflow is the load-bearing assertion: a long GDPR table
 * can break the trigger row at 375px wide if a future edit forgets
 * to wrap a `min-width: 36rem` table in a scrollable container. CSS
 * `text-overflow: ellipsis` would silently hide the regression —
 * `scrollWidth <= clientWidth` does not.
 */

describe('Privacy policy — canonical English /privacy (#291)', () => {
  beforeEach(() => {
    cy.visit('/privacy');
  });

  it('renders the English title, draft banner, and version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', 'Privacy Policy');
    cy.get('[data-cy="privacy-draft-banner"]')
      .should('be.visible')
      .and('contain.text', 'Technical draft');
    cy.get('[data-cy="privacy-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Version')
      .and('contain.text', '2026-04-30');
  });

  it('language toggle links to the Italian translation at /privacy/it', () => {
    cy.get('[data-cy="privacy-lang-toggle"] [data-cy="privacy-lang-it"]').should(
      'have.attr',
      'href',
      '/privacy/it',
    );
  });

  it('the back-home CTA navigates away from /privacy (root redirects to /auth/login for unauth visitors)', () => {
    cy.get('[data-cy="privacy-home"]').click();
    cy.location('pathname').should('eq', '/auth/login');
  });

  it('cross-links to /sub-processors so the chain stays auditable', () => {
    cy.contains('a[href="/sub-processors"]', '/sub-processors').should('exist');
  });
});

describe('Privacy policy — Italian /privacy/it (#291)', () => {
  beforeEach(() => {
    cy.visit('/privacy/it');
  });

  it('renders the Italian title, draft banner, and version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', 'Informativa sulla Privacy');
    cy.get('[data-cy="privacy-draft-banner"]').should('be.visible').and('contain.text', 'Bozza');
    cy.get('[data-cy="privacy-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Versione')
      .and('contain.text', '2026-04-30');
  });

  it('language toggle links back to the canonical /privacy', () => {
    cy.get('[data-cy="privacy-lang-toggle"] [data-cy="privacy-lang-en"]').should(
      'have.attr',
      'href',
      '/privacy',
    );
  });

  it('the back-home CTA navigates to /auth/login (unauth root redirect)', () => {
    cy.get('[data-cy="privacy-home"]').click();
    cy.location('pathname').should('eq', '/auth/login');
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Privacy policy fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
    });

    // Both language versions must fit. Same-shape assertion against
    // the document scrollWidth — catches an oversized table or an
    // unbreakable email link that pushes the body wider than the
    // viewport.
    for (const path of ['/privacy', '/privacy/it']) {
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
