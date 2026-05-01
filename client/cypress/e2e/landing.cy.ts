/**
 * Public landing / about page (#330) at `/` — replaces the cold
 * redirect to `/auth/login` we used to ship. Pairs with #331 (login
 * UX repositioning, the routing change is in the same PR).
 *
 * Cypress sweep covers the cold-visitor flow:
 *   - `/` lands on the marketing page (NOT on /auth/login)
 *   - Header has a Login text link → /auth/login
 *   - Header has a Sign-up primary button → /auth/register
 *   - Hero CTA → /auth/register
 *   - Footer Privacy + Sub-processors links → public routes
 *
 * Authenticated bypass (publicGuard redirecting to /dashboard) is
 * exercised by the dedicated public-guard vitest spec — putting it
 * in cypress would need full HTTP intercepts to fake a logged-in
 * session and the unit-level test is enough for that branch.
 */
describe('Landing page (#330)', () => {
  beforeEach(() => {
    // No auth token, no API calls. Cold visit.
    cy.visit('/');
  });

  it('renders the marketing page at `/` (not the login form)', () => {
    cy.location('pathname').should('eq', '/');

    cy.get('.landing__hero-headline')
      .should('be.visible')
      .and('contain.text', 'Run your academy from your phone');

    cy.get('[data-cy="landing-hero-cta"]').should('be.visible').and('contain.text', 'Start free');
  });

  it('the header Login link routes to /auth/login', () => {
    cy.get('[data-cy="landing-login"]')
      .should('be.visible')
      .and('have.attr', 'href', '/auth/login');
  });

  it('the header Sign-up button routes to /auth/register', () => {
    // <p-button [routerLink]> renders a programmatic-navigation
    // <button> (not an <a>), so we click and verify the URL change
    // rather than asserting `href`. The cypress-side equivalent of
    // the unit test that verifies the data-cy hook + label.
    cy.intercept('POST', '/api/v1/auth/login', { statusCode: 401 }).as('noLogin');
    cy.get('[data-cy="landing-signup"]').should('be.visible').click();
    cy.location('pathname').should('eq', '/auth/register');
  });

  it('the hero CTA also routes to /auth/register', () => {
    cy.get('[data-cy="landing-hero-cta"]').should('be.visible').click();
    cy.location('pathname').should('eq', '/auth/register');
  });

  it('the footer carries Privacy + Sub-processors links + GitHub', () => {
    cy.get('[data-cy="landing-footer-privacy"]').should('have.attr', 'href', '/privacy');
    cy.get('[data-cy="landing-footer-subprocessors"]').should(
      'have.attr',
      'href',
      '/sub-processors',
    );
    cy.contains('a', 'GitHub').should('have.attr', 'href', 'https://github.com/Budojo/budojo');
  });

  it('the language toggle flips between EN / IT', () => {
    // Toggle starts on EN by default — the button shows the OTHER
    // language as its label (IT). After clicking, the page renders
    // Italian copy.
    cy.get('[data-cy="landing-lang-toggle"]').should('contain.text', 'IT').click();

    cy.get('.landing__hero-headline').should('contain.text', 'Gestisci la tua palestra');

    // Click again to flip back to English.
    cy.get('[data-cy="landing-lang-toggle"]').should('contain.text', 'EN').click();
    cy.get('.landing__hero-headline').should('contain.text', 'Run your academy from your phone');
  });
});
