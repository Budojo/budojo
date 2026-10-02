/**
 * The visual-verification harness (#1460), driven by `make shot`.
 *
 * Every UI change is supposed to get a real-browser look before it is pushed
 * — `docs/development/visual-verification.md` has said so for a long time —
 * but the recipe was "write a throwaway spec", which meant inventing fixtures
 * and remembering to delete it afterwards. Half the time the throwaway spec
 * was the bug: a stale one shipped `<<<<<<< HEAD` to four mobile cards with
 * both gates green.
 *
 * So this one is permanent, takes the route from the environment, and shoots
 * the two widths the canon cares about. It runs against whatever the dev
 * backend is serving, which is the point: real data, real empty states.
 *
 *   make shot PAGE=/dashboard/athletes
 */
const route = Cypress.env('PAGE') ?? '/dashboard/athletes';

/**
 * The runtime to shoot as (`make shot RUNTIME=mobile`): its real capability
 * set, so a surface a runtime lacks is absent from the shot as it is from the
 * app. Unset, the web default.
 */
const RUNTIME_CAPABILITIES: Record<string, string[]> = {
  desktop: ['document_upload', 'sync'],
  mobile: ['sync'],
};
const runtime = String(Cypress.env('RUNTIME') ?? '');
/** `make shot THEME=dark`: the theme to shoot in. Unset, the system's (light here). */
const theme = String(Cypress.env('THEME') ?? '');
if (theme !== '' && theme !== 'dark' && theme !== 'light') {
  throw new Error(`Unknown THEME "${theme}": use dark or light.`);
}
const visitOptions = {
  onBeforeLoad(win: Window): void {
    if (theme !== '') win.localStorage.setItem('budojoTheme', theme);
  },
};
if (runtime !== '' && !(runtime in RUNTIME_CAPABILITIES)) {
  // A typo would otherwise shoot the web nav under a name that says otherwise.
  throw new Error(
    `Unknown RUNTIME "${runtime}": use ${Object.keys(RUNTIME_CAPABILITIES).join(' or ')}.`,
  );
}

/**
 * The shell's own calls, stubbed so the page renders at all.
 *
 * `visitAuthenticated` seeds a fake token, which the real dev backend
 * rejects — the app then redirects to login and the shot is a blank page.
 * That is exactly what the first version of this harness produced, and the
 * filenames looked fine, which is how it nearly shipped.
 *
 * The catch-all keeps every other endpoint quiet. **Pages render their EMPTY
 * state**: this harness is for chrome, spacing and responsive behaviour. A
 * shot that needs rows still needs a spec with fixtures — say so rather than
 * pretending otherwise.
 */
function stubShell(): void {
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  if (runtime !== '') {
    cy.intercept('GET', '/api/v1/runtime', {
      statusCode: 200,
      body: { data: { profile: runtime, capabilities: RUNTIME_CAPABILITIES[runtime] } },
    });
  }
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
  cy.intercept('GET', '/api/v1/documents/expiring*', {
    statusCode: 200,
    body: { data: [], missing_medical_certificate: [] },
  });
  cy.intercept('GET', '/api/v1/athletes*', {
    statusCode: 200,
    body: {
      data: [],
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        path: '',
        per_page: 20,
        to: null,
        total: 0,
      },
    },
  });
}
const slug =
  (runtime ? `${runtime}-` : '') +
    (theme ? `${theme}-` : '') +
    String(route)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || 'page';

/**
 * Refuse to shoot through the dev server's compile-error overlay.
 *
 * It has happened twice: the page renders correctly underneath, the shot
 * looks like a red banner over the real thing, and the reflex is to read the
 * banner as the current state of the code — when it is usually a stale error
 * from an intermediate save that the running bundle has already moved past.
 * Failing here says "rebuild and try again" instead of leaving a misleading
 * image on disk.
 */
function noBuildOverlay(): void {
  cy.get('vite-error-overlay, .vite-error-overlay, ng-component-overlay').should('not.exist');
  cy.contains(/^NG\d{4}:/).should('not.exist');
}

describe(`shot ${route}`, () => {
  it('desktop 1280', () => {
    cy.viewport(1280, 800);
    stubShell();
    cy.visitAuthenticated(route, undefined, visitOptions);
    // Give the page its data before the shutter — a screenshot of a skeleton
    // is a screenshot of nothing.
    cy.get('body').should('be.visible');
    cy.wait(1200);
    noBuildOverlay();
    cy.screenshot(`${slug}-1280`, { overwrite: true, capture: 'viewport' });
  });

  it('mobile 375', () => {
    cy.viewport(375, 800);
    stubShell();
    cy.visitAuthenticated(route, undefined, visitOptions);
    cy.get('body').should('be.visible');
    cy.wait(1200);
    noBuildOverlay();
    cy.screenshot(`${slug}-375`, { overwrite: true, capture: 'viewport' });
  });
});
