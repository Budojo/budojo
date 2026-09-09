/**
 * The app's first screen at `/` (#330, rewritten in #1497).
 *
 * It was a marketing page, and this spec covered a cold visitor arriving on
 * a website. Nothing serves it on the web any more (#1230 decommissioned the
 * hosted stack and there is no deploy workflow left) — the only thing that
 * renders it is the desktop app, which loads `APP_ORIGIN/`, with
 * `publicGuard` sending anyone who already has an account to the roster.
 *
 * So the flow under test is not a prospect deciding. It is someone who has
 * just installed Budojo, has no account, and needs to know what to do.
 *
 * The authenticated bypass (publicGuard → /dashboard) is covered by the
 * public-guard vitest spec; faking a session here would need full HTTP
 * intercepts for no extra confidence.
 */
/**
 * The support link must END above where the consent banner STARTS.
 *
 * Read off the live rects rather than asserted as a constant: the banner's
 * height depends on how its three buttons wrap, which depends on the width
 * and on the language.
 */
function assertClearOfBanner(): void {
  // Scrolled to the foot first: on a short window the page is taller than the
  // viewport whatever we do, and what has to be true is that the link is
  // REACHABLE — not that it happens to start on screen.
  cy.scrollTo('bottom');
  cy.get('[data-cy="cookie-banner"]').then(($banner) => {
    const bannerTop = $banner[0].getBoundingClientRect().top;
    cy.get('[data-cy="landing-footer-support"]').then(($link) => {
      expect(
        $link[0].getBoundingClientRect().bottom,
        'support link bottom vs banner top',
      ).to.be.lessThan(bannerTop);
    });
  });
}

describe('First screen (#1497)', () => {
  beforeEach(() => {
    // No auth token, no API calls. A first run.
    cy.visit('/');
  });

  it('welcomes rather than sells', () => {
    cy.location('pathname').should('eq', '/');

    cy.get('.landing__headline')
      .should('be.visible')
      .and('contain.text', 'Run your academy, not a spreadsheet');

    // The page used to promise an iOS and Android install, a phone-first
    // product, and an in-app contact form #1464 removed for not working.
    cy.get('.landing').should('not.contain.text', 'iOS');
    cy.get('.landing').should('not.contain.text', 'Android');
    cy.get('.landing').should('not.contain.text', 'credit card');
  });

  it('creates the academy from the one filled button', () => {
    // `<p-button [routerLink]>` renders a programmatic-navigation <button>,
    // not an <a>, so this clicks and asserts the URL rather than the href.
    // The 10s timeout absorbs the slowest CI shard's startup (#708 / #710).
    cy.get('[data-cy="landing-signup"]')
      .should('be.visible')
      .and('contain.text', 'Create your academy')
      .click();

    cy.location('pathname', { timeout: 10_000 }).should('eq', '/auth/register');
  });

  it('keeps log in as the quieter route, for a reinstall or a second machine', () => {
    cy.get('[data-cy="landing-login"]')
      .should('be.visible')
      .and('contain.text', 'I already have an account')
      .and('have.attr', 'href', '/auth/login');
  });

  it('shows the three steps, numbered, in order', () => {
    cy.get('.landing__step').should('have.length', 3);
    cy.get('.landing__step').eq(0).should('contain.text', 'Create your account');
    cy.get('.landing__step').eq(1).should('contain.text', 'Set up the academy');
    cy.get('.landing__step').eq(2).should('contain.text', 'Add your first athlete');
  });

  it('leaves a way to reach a person, and the legal pages', () => {
    // Support is the load-bearing one: every other route to it is behind the
    // login this reader cannot get past (#1476).
    cy.get('[data-cy="landing-footer-support"]')
      .should('have.attr', 'href')
      .and('include', 'mailto:matteobonanno1990@gmail.com');

    cy.get('[data-cy="landing-footer-privacy"]').should('have.attr', 'href', '/privacy');
    cy.get('[data-cy="landing-footer-terms"]').should('have.attr', 'href', '/terms');
    cy.get('[data-cy="landing-footer-help"]').should('have.attr', 'href', '/help');
  });

  it('keeps the support link clear of the consent banner on a genuine first run', () => {
    // The banner is `position: fixed; bottom: 0` and this page pins its
    // footer to the bottom of the viewport, so without room reserved for it
    // the support link sits underneath — present in the DOM, correct href,
    // and completely covered. An attribute assertion cannot see that; a
    // visibility assertion with the banner actually up can.
    cy.clearLocalStorage();
    cy.visit('/');

    // Geometry, not `be.visible`: Cypress's visibility rule ignores an element
    // covered by a fixed overlay, so `be.visible` passes on a link buried
    // under the banner. What has to be true is that the link ends above where
    // the banner starts.
    cy.get('[data-cy="cookie-banner"]').should('be.visible');
    assertClearOfBanner();

    // And again at the width where the banner's buttons wrap and it grows to
    // roughlythree  times the height.
    cy.viewport(390, 844);
    assertClearOfBanner();
  });

  it('the language toggle flips between EN / IT', () => {
    // The button shows the OTHER language as its label.
    cy.get('[data-cy="landing-lang-toggle"]').should('contain.text', 'IT').click();

    cy.get('.landing__headline').should('contain.text', "Gestisci l'accademia");

    cy.get('[data-cy="landing-lang-toggle"]').should('contain.text', 'EN').click();

    cy.get('.landing__headline').should('contain.text', 'Run your academy');
  });

  it('does not overflow a phone', () => {
    cy.viewport(390, 844);
    cy.get('.landing__headline').should('be.visible');

    cy.document().then((doc) => {
      const root = doc.documentElement;
      expect(root.scrollWidth, 'documentElement.scrollWidth').to.be.lte(root.clientWidth);
    });
  });
});
