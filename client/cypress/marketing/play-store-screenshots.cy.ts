/*
 * Play Store screenshot capture spec (#690).
 *
 * NOT a test. Visits five canonical owner-facing screens at three viewports
 * matching the Play Store slot dimensions and writes one PNG per
 * combination under `docs/marketing/screenshots/play-store/<viewport>/`.
 *
 * The output is the asset library uploaded to the Play Console listing
 * — phone slot, tablet 7" slot, tablet 10" slot. Three viewports × five
 * screens = 15 PNGs, well above the Play Store minimum (2 per type).
 *
 * Run with:  npm run play-store:screenshots
 *
 * Sits in `cypress/marketing/` deliberately so it is OUT of the default
 * `cypress/e2e/**\/*.cy.ts` glob declared in `cypress.config.ts`.
 * Mirror of the `cypress/inventory/` pattern that produces the design
 * inventory — same "exclude by folder, not by excludeSpecPattern"
 * rationale (the latter silently drops --spec runs on Cypress 13+).
 *
 * Viewport choice rationale (CSS pixels = PNG image pixels — Cypress
 * captures 1:1 with the viewport):
 *
 *   - phone (1080×2400) — > 768 so the dashboard shell with sidebar
 *     renders, > 1024 so the full two-column layout shows. Selected
 *     over Pixel-class 412×915 because the Play Store "promotable"
 *     threshold is min 1080 px on each side; a 412 wide screenshot
 *     publishes fine but never gets featured in carousels.
 *   - tablet-7 (1080×1440) — 3:4 portrait, inside the 320-3840 range.
 *   - tablet-10 (1600×2560) — 5:8 portrait, inside the strict
 *     1080-7680 range Google requires for the tablet-10 slot.
 *
 * Trade-off (worth re-evaluating): the phone slot ends up showing the
 * desktop-with-sidebar layout, not the mobile topbar+drawer canon. For
 * a productivity / B2B SaaS like Budojo, the desktop view IS the
 * compelling marketing surface (sidebar nav, multi-column dashboard),
 * so the trade-off lands in favour of "promotable" over "mobile UX
 * fidelity". If a future iteration wants mobile-UX phone screenshots
 * we add a second 412×915 capture pass under `phone-mobile-ux/` and
 * pick per-slot at upload time.
 *
 * ## Data strategy: real DB, not mocks
 *
 * An earlier draft of this spec mocked every endpoint via
 * `cy.intercept()`. Across the breadth of API surfaces the SPA touches
 * (auth/me, academy, athletes paginated, documents, attendance,
 * attendance/summary, community/feed, stats overview, stats/attendance/daily,
 * stats/payments/monthly, notification prefs, onboarding, ...) the
 * mock-map became fragile: a missing intercept or a fixture-shape
 * drift produced empty tables, blank charts, and perpetual skeletons
 * in the resulting PNGs. The spec now logs in against the dev DB
 * (seeded via `php artisan db:seed` — the existing AdminSeeder +
 * DemoAcademy* chain) and lets the SPA hit the real Laravel API.
 * Response shapes are then guaranteed by the API resources, not by
 * hand-rolled fixtures.
 *
 * Login credentials match what `AdminSeeder` produces with
 * `LOCAL_ADMIN_PASSWORD=password`. The DemoAcademy* seeders create
 * 40 athletes, ~4k attendance records, and ~400 payments under the
 * "Academy Gracie Milano" academy.
 */

const VIEWPORTS = [
  { slug: 'phone', width: 1080, height: 2400 },
  { slug: 'tablet-7', width: 1080, height: 1440 },
  { slug: 'tablet-10', width: 1600, height: 2560 },
] as const;

type ViewportSlot = (typeof VIEWPORTS)[number];

// Cached Sanctum token from the one-time real login. Hoisted to module
// scope so the `before()` hook below can populate it once and every
// `it()` block reuses it — login throttling never trips, and the
// login form never appears on a screenshot.
let AUTH_TOKEN = '';

/**
 * Capture one route at every Play Store viewport. Filename pattern:
 * `<viewport-slug>/<screen-slug>.png` — Cypress creates the subdir on
 * first write, which keeps the docs/marketing/screenshots tree tidy
 * (phone/, tablet-7/, tablet-10/).
 *
 * `readySelector` is an app-rendered `data-cy` that must be visible
 * before we capture — avoids the fixed-`cy.wait(400)` flake the
 * design inventory replaced (see its rationale comment).
 */
function captureAtAllViewports(route: string, slug: string, readySelector: string): void {
  VIEWPORTS.forEach((vp: ViewportSlot) => {
    it(`${slug} @ ${vp.slug} (${vp.width}×${vp.height})`, () => {
      cy.viewport(vp.width, vp.height);
      // Reuse `cy.visitAuthenticated`'s localStorage scaffolding
      // (cookie consent, language pin) — pass the REAL Sanctum token
      // captured in `before()` so the SPA's `authGuard` accepts the
      // session.
      cy.visitAuthenticated(route, AUTH_TOKEN);
      cy.get(readySelector, { timeout: 15_000 }).should('be.visible');
      // Small post-render wait — chart libs (apex/echarts/ngx-charts)
      // animate slice entry over ~300ms; pinning the screenshot 800ms
      // after the container is visible lets the animation settle.
      // Without this stats-belt-chart container exists but the SVG
      // path slices haven't drawn yet.
      cy.wait(800);
      // `viewport` over `fullPage` — Play Store slots show the
      // top-of-page (the hero), not an infinitely tall composite. The
      // resulting PNG dimensions match the viewport CSS pixels 1:1, so
      // the file size and aspect ratio land exactly inside the slot
      // requirements without per-slot post-processing.
      cy.screenshot(`${vp.slug}/${slug}`, {
        capture: 'viewport',
        overwrite: true,
      });
    });
  });
}

describe('Play Store screenshots — capture run', () => {
  before(() => {
    // Real login against the seeded dev DB. Credentials match the
    // AdminSeeder default (LOCAL_ADMIN_PASSWORD=password). The
    // resulting Sanctum token is reused by every `it()` block.
    cy.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { email: 'admin@example.it', password: 'password' },
      failOnStatusCode: true,
    }).then((response) => {
      AUTH_TOKEN = response.body.token;
      expect(AUTH_TOKEN, 'Sanctum auth token').to.be.a('string').and.have.length.greaterThan(20);
    });
  });

  // Ready selectors target ROW-LEVEL elements that only render once
  // the API returned actual data — not the page-shell buttons which
  // appear during loading. Earlier iterations waited on the shell
  // and screenshotted half-loaded pages (empty tables, skeleton
  // attendance widget).
  captureAtAllViewports('/dashboard/athletes', 'athletes-list', '[data-cy="athlete-name-link"]');
  captureAtAllViewports(
    '/dashboard/athletes/32/promotions',
    'athlete-promotions',
    '[data-cy="athlete-tabs"]',
  );
  // attendance-th-name is the table column header that only renders
  // after the academy + attendance lists resolve (the shell wraps the
  // whole page in `@if (loaded()) { ... }` style guards).
  captureAtAllViewports(
    '/dashboard/attendance',
    'attendance-daily',
    '[data-cy="attendance-th-name"]',
  );
  captureAtAllViewports('/dashboard/community', 'community-feed', '[data-cy="my-feed-list"]');
  // stats-belt-chart is the chart container — `stats-total` renders
  // earlier (just text), but waiting for the chart container ensures
  // the chart library has mounted before we capture the viewport.
  captureAtAllViewports('/dashboard/stats', 'stats-overview', '[data-cy="stats-belt-chart"]');
});
