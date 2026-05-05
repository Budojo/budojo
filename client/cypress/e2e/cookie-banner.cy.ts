/**
 * Cookie consent banner + cookie policy E2E (#421).
 *
 * Covers the EU e-Privacy directive minimum:
 *   - Banner shows on first visit (no stored consent).
 *   - Each of the three CTAs (accept / reject / customise) persists
 *     a payload that survives a page reload.
 *   - The persisted choice silences the banner on the next visit.
 *   - Reject keeps a future analytics tag from loading — the gate is
 *     load-bearing because there is nothing wired today.
 *   - The cookie-policy page (EN + IT) is reachable and cross-links
 *     match the privacy / sub-processors discipline.
 */

const STORAGE_KEY = 'budojoCookieConsent';

describe('Cookie banner — first visit (#421)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('shows the banner on the public landing page', () => {
    cy.visit('/');
    cy.get('[data-cy="cookie-banner"]').should('be.visible');
    cy.get('[data-cy="cookie-banner-accept"]').should('exist');
    cy.get('[data-cy="cookie-banner-reject"]').should('exist');
    cy.get('[data-cy="cookie-banner-customise"]').should('exist');
  });

  it('shows the banner on the public privacy page', () => {
    cy.visit('/privacy');
    cy.get('[data-cy="cookie-banner"]').should('be.visible');
  });

  it('Accept all → banner disappears, choice persists across reload', () => {
    cy.visit('/');
    cy.get('[data-cy="cookie-banner-accept"]').click();
    cy.get('[data-cy="cookie-banner"]').should('not.exist');

    cy.window().then((win) => {
      const raw = win.localStorage.getItem(STORAGE_KEY);
      expect(raw, 'consent payload').to.not.equal(null);
      const parsed = JSON.parse(raw as string);
      expect(parsed.version).to.equal(1);
      expect(parsed.choices.analytics).to.equal(true);
      expect(parsed.choices.marketing).to.equal(true);
    });

    cy.reload();
    cy.get('[data-cy="cookie-banner"]').should('not.exist');
  });

  it('Reject non-essential → banner disappears, analytics flag is false', () => {
    cy.visit('/');
    cy.get('[data-cy="cookie-banner-reject"]').click();
    cy.get('[data-cy="cookie-banner"]').should('not.exist');

    cy.window().then((win) => {
      const parsed = JSON.parse(win.localStorage.getItem(STORAGE_KEY) as string);
      expect(parsed.choices.analytics).to.equal(false);
      expect(parsed.choices.marketing).to.equal(false);
      expect(parsed.choices.essential).to.equal(true);
    });
  });

  it('Customise → opens dialog with all four categories, save persists granular choices', () => {
    cy.visit('/');
    cy.get('[data-cy="cookie-banner-customise"]').click();
    // The p-dialog overlay mask is the load-bearing visibility marker;
    // the `<p-dialog>` host stays mounted even when closed (gotchas.md).
    cy.get('.p-dialog-mask').should('be.visible');

    // Every category is listed
    cy.get('[data-cy="cookie-category-essential"]').should('exist');
    cy.get('[data-cy="cookie-category-preferences"]').should('exist');
    cy.get('[data-cy="cookie-category-analytics"]').should('exist');
    cy.get('[data-cy="cookie-category-marketing"]').should('exist');

    // Toggle preferences ON, leave the other two off
    cy.get('[data-cy="cookie-category-toggle-preferences"]').click();
    cy.get('[data-cy="cookie-banner-dialog-save"]').click();

    cy.get('.p-dialog-mask').should('not.exist');
    cy.get('[data-cy="cookie-banner"]').should('not.exist');

    cy.window().then((win) => {
      const parsed = JSON.parse(win.localStorage.getItem(STORAGE_KEY) as string);
      expect(parsed.choices.preferences).to.equal(true);
      expect(parsed.choices.analytics).to.equal(false);
      expect(parsed.choices.marketing).to.equal(false);
    });
  });
});

describe('Cookie banner — analytics gate (#421)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  // The gate is the load-bearing assertion of this feature: a future
  // analytics bootstrap (gtag, plausible, posthog, anything) MUST
  // check ConsentService.hasConsent('analytics') before injecting a
  // tag. We assert here that no third-party analytics script exists
  // in the DOM after Reject — the same assertion will pass after a
  // future analytics integration that respects the gate.
  it('Reject keeps analytics tags out of the document', () => {
    cy.visit('/');
    cy.get('[data-cy="cookie-banner-reject"]').click();

    cy.document().then((doc) => {
      const scripts = Array.from(doc.querySelectorAll('script'));
      const analyticsHosts = [
        'google-analytics.com',
        'googletagmanager.com',
        'plausible.io',
        'segment.com',
        'mixpanel.com',
        'hotjar.com',
        'clarity.ms',
      ];
      const matched = scripts.filter((s) =>
        analyticsHosts.some((h) => (s.src ?? '').includes(h)),
      );
      expect(matched, 'no analytics tags after reject').to.have.lengthOf(0);
    });
  });
});

describe('Cookie banner — already decided (#421)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('does NOT show on a return visit when a current-version payload exists', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            choices: { essential: true, preferences: false, analytics: false, marketing: false },
            savedAt: '2026-04-30T00:00:00.000Z',
          }),
        );
      },
    });
    cy.get('[data-cy="cookie-banner"]').should('not.exist');
  });

  it('re-shows after a CONSENT_VERSION bump (stale payload)', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 0,
            choices: { essential: true, preferences: true, analytics: true, marketing: true },
            savedAt: '2024-01-01T00:00:00.000Z',
          }),
        );
      },
    });
    cy.get('[data-cy="cookie-banner"]').should('be.visible');
  });
});

describe('Cookie policy page (#421)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('renders the canonical English /cookie-policy with title and version', () => {
    cy.visit('/cookie-policy');
    cy.get('.legal-page__title').should('contain.text', 'Cookie Policy');
    cy.get('[data-cy="cookie-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Version')
      .and('contain.text', '2026-05-05');
  });

  it('language toggle on /cookie-policy points to /cookie-policy/it', () => {
    cy.visit('/cookie-policy');
    cy.get('[data-cy="cookie-lang-toggle"] [data-cy="cookie-lang-it"]').should(
      'have.attr',
      'href',
      '/cookie-policy/it',
    );
  });

  it('back-home CTA navigates to / (the public landing page)', () => {
    // Pre-decide consent so the sticky banner doesn't intercept the click
    cy.visit('/cookie-policy', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            choices: { essential: true, preferences: false, analytics: false, marketing: false },
            savedAt: '2026-04-30T00:00:00.000Z',
          }),
        );
      },
    });
    cy.get('[data-cy="cookie-home"]').click();
    cy.location('pathname').should('eq', '/');
  });

  it('Italian /cookie-policy/it title is the Italian copy', () => {
    cy.visit('/cookie-policy/it');
    cy.get('.legal-page__title').should('contain.text', 'Cookie Policy');
    cy.get('[data-cy="cookie-version-stamp"]')
      .should('be.visible')
      .and('contain.text', 'Versione')
      .and('contain.text', '2026-05-05');
  });

  it('language toggle on /cookie-policy/it points back to /cookie-policy', () => {
    cy.visit('/cookie-policy/it');
    cy.get('[data-cy="cookie-lang-toggle"] [data-cy="cookie-lang-en"]').should(
      'have.attr',
      'href',
      '/cookie-policy',
    );
  });

  it('Manage preferences link reopens the banner after a previous decision', () => {
    cy.visit('/cookie-policy', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            choices: { essential: true, preferences: false, analytics: false, marketing: false },
            savedAt: '2026-04-30T00:00:00.000Z',
          }),
        );
      },
    });
    cy.get('[data-cy="cookie-banner"]').should('not.exist');
    cy.get('[data-cy="cookie-policy-manage"]').click();
    cy.get('[data-cy="cookie-banner"]').should('be.visible');
  });
});

describe('Cookie banner cross-link from /privacy (#421)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('the privacy page exposes a link to /cookie-policy', () => {
    cy.visit('/privacy');
    cy.get('a[href="/cookie-policy"], a[routerLink="/cookie-policy"]').should('exist');
  });

  it('the Italian privacy page exposes a link to /cookie-policy/it', () => {
    cy.visit('/privacy/it');
    cy.get('a[href="/cookie-policy/it"], a[routerLink="/cookie-policy/it"]').should('exist');
  });
});
