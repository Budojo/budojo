import { MOBILE_VIEWPORTS } from '../support/viewports';

/**
 * Public Terms-of-Service pages (#420) — `/terms` is canonical English,
 * `/terms/it` is the faithful Italian translation kept in lock-step.
 * Both routes are unauthenticated — a prospect must be able to read
 * either before they tick the acceptance box during registration.
 *
 * Same shape as the privacy spec: title + placeholder banner, lang
 * toggle, back-home CTA, mobile overflow guard.
 */

describe('Terms of Service — canonical English /terms (#420)', () => {
  beforeEach(() => {
    cy.visit('/terms');
  });

  it('renders the English title, placeholder banner, and version stamp', () => {
    cy.get('.legal-page__title').should('contain.text', 'Terms of Service');
    cy.get('[data-cy="terms-placeholder-banner"]')
      .should('be.visible')
      .and('contain.text', 'Placeholder');
    cy.get('[data-cy="terms-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Version')
      .and('contain.text', '2026-05-05');
  });

  it('language toggle links to the Italian translation at /terms/it', () => {
    cy.get('[data-cy="terms-lang-toggle"] [data-cy="terms-lang-it"]').should(
      'have.attr',
      'href',
      '/terms/it',
    );
  });

  it('the back-home CTA navigates to / (the public landing page)', () => {
    cy.get('[data-cy="terms-home"]').click();
    cy.location('pathname').should('eq', '/');
  });

  it('cross-links to the privacy policy', () => {
    cy.get('a[href="/privacy"]').should('exist');
  });
});

describe('Terms of Service — Italian /terms/it (#420)', () => {
  beforeEach(() => {
    cy.visit('/terms/it');
  });

  it('renders the Italian title and placeholder banner', () => {
    cy.get('.legal-page__title').should('contain.text', 'Termini di Servizio');
    cy.get('[data-cy="terms-placeholder-banner"]')
      .should('be.visible')
      .and('contain.text', 'segnaposto');
  });

  it('language toggle links back to the canonical /terms', () => {
    cy.get('[data-cy="terms-lang-toggle"] [data-cy="terms-lang-en"]').should(
      'have.attr',
      'href',
      '/terms',
    );
  });

  it('cross-links to the Italian privacy policy', () => {
    cy.get('a[href="/privacy/it"]').should('exist');
  });
});

MOBILE_VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Terms of Service fits on mobile (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
    });

    for (const path of ['/terms', '/terms/it']) {
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
