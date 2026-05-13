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
 * Deterministic intercepts + frozen clock — re-running without a UI
 * change produces zero git diff on the committed PNGs.
 */
import {
  PS_ACADEMY,
  PS_ATHLETE_DETAIL,
  PS_ATHLETE_PROMOTIONS,
  PS_ATHLETES_LIST,
  PS_ATTENDANCE_TODAY,
  PS_COMMUNITY_FEED,
  PS_DOCUMENTS_EXPIRING,
  PS_FROZEN_NOW,
  PS_STATS_ATTENDANCE_DAILY,
  PS_STATS_OVERVIEW,
  PS_STATS_PAYMENTS_MONTHLY,
} from '../support/play-store-fixtures';

const VIEWPORTS = [
  { slug: 'phone', width: 1080, height: 2400 },
  { slug: 'tablet-7', width: 1080, height: 1440 },
  { slug: 'tablet-10', width: 1600, height: 2560 },
] as const;

type ViewportSlot = (typeof VIEWPORTS)[number];

function seedIntercepts(): void {
  // Order matters in cy.intercept: matchers are evaluated in REVERSE
  // registration order — the LAST-DECLARED wins for any request that
  // multiple matchers match. We declare the catch-all FIRST so the
  // specific intercepts below it override per endpoint, and any URL
  // we forgot still gets a benign empty-data 200 (instead of crashing
  // the page with a 404 from the real backend).
  cy.intercept({ method: 'GET', pathname: '/api/v1/**' }, {
    statusCode: 200,
    body: { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } },
  });

  // Auth/me — needed because the SPA's bootstrap hits this to hydrate
  // the current-user signal. Without it the dashboard renders empty
  // (no academy name, no current-user flair on community posts).
  cy.intercept({ method: 'GET', pathname: '/api/v1/auth/me' }, {
    statusCode: 200,
    body: {
      data: {
        id: 1,
        first_name: 'João',
        last_name: 'Almeida',
        name: 'João Almeida',
        email: 'joao@graciemilano.it',
        role: 'owner',
        avatar_url: null,
        has_academy: true,
        language: 'en',
        two_factor_enabled: false,
        notification_preferences: {},
        onboarding_dismissed: true,
        terms_accepted_at: '2025-01-01T00:00:00+00:00',
      },
    },
  });

  // All intercepts use `pathname` — most robust matcher because it
  // ignores both query string AND base URL (so `apiBase = 'http://
  // localhost:8000'` doesn't break the match).
  cy.intercept({ method: 'GET', pathname: '/api/v1/academy' }, {
    statusCode: 200,
    body: { data: PS_ACADEMY },
  });

  // Order matters: cy.intercept matches LAST-DECLARED first, so the
  // most-specific patterns (athletes/1/...) must come AFTER the broad
  // athletes-list intercept to take precedence.
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes' }, {
    statusCode: 200,
    body: PS_ATHLETES_LIST,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes/1' }, {
    statusCode: 200,
    body: PS_ATHLETE_DETAIL,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes/1/promotions' }, {
    statusCode: 200,
    body: PS_ATHLETE_PROMOTIONS,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes/1/documents' }, {
    statusCode: 200,
    body: { data: [] },
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes/1/payments' }, {
    statusCode: 200,
    body: { data: [] },
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/athletes/1/attendance' }, {
    statusCode: 200,
    body: { data: [] },
  });

  cy.intercept({ method: 'GET', pathname: '/api/v1/documents/expiring' }, {
    statusCode: 200,
    body: PS_DOCUMENTS_EXPIRING,
  });

  cy.intercept({ method: 'GET', pathname: '/api/v1/attendance' }, {
    statusCode: 200,
    body: PS_ATTENDANCE_TODAY,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/attendance/summary' }, {
    statusCode: 200,
    body: { data: [] },
  });

  cy.intercept({ method: 'GET', pathname: '/api/v1/community/feed' }, {
    statusCode: 200,
    body: PS_COMMUNITY_FEED,
  });

  cy.intercept({ method: 'GET', pathname: '/api/v1/stats/overview' }, {
    statusCode: 200,
    body: PS_STATS_OVERVIEW,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/stats/attendance/daily' }, {
    statusCode: 200,
    body: PS_STATS_ATTENDANCE_DAILY,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/stats/payments/monthly' }, {
    statusCode: 200,
    body: PS_STATS_PAYMENTS_MONTHLY,
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/stats/athletes/age-bands' }, {
    statusCode: 200,
    body: { data: [] },
  });

  cy.intercept({ method: 'GET', pathname: '/api/v1/me/onboarding' }, {
    statusCode: 200,
    body: { data: { dismissed: true, steps: [] } },
  });
  cy.intercept({ method: 'GET', pathname: '/api/v1/me/notification-preferences' }, {
    statusCode: 200,
    body: { data: { categories: {} } },
  });
}

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
      seedIntercepts();
      cy.visitAuthenticated(route, undefined, {
        onBeforeLoad(win) {
          win.Date.now = () => PS_FROZEN_NOW;
        },
      });
      cy.get(readySelector, { timeout: 10_000 }).should('be.visible');
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
  // Ready selectors are picked from data-cys that render WHEN THE PAGE
  // HAS LOADED AND THE INTERCEPTED API RETURNED — not on the shell
  // itself. A shell-level selector would let Cypress fire `screenshot`
  // mid-bootstrap, producing a half-rendered hero image.
  captureAtAllViewports('/dashboard/athletes', 'athletes-list', '[data-cy="add-athlete-btn"]');
  // The back-arrow link is the first hero element the athlete-detail
  // component renders unconditionally — earlier than the tabs row
  // (which only mounts once the athlete query resolves).
  captureAtAllViewports(
    '/dashboard/athletes/1/promotions',
    'athlete-promotions',
    '[data-cy="athlete-detail-back"]',
  );
  // The attendance section wrapper is rendered as soon as the route
  // mounts; the rest of the dashboard hydrates after.
  captureAtAllViewports('/dashboard/attendance', 'attendance-daily', '[data-cy="attendance-page"]');
  // The community feed renders three terminal states (`my-feed-list`,
  // `my-feed-empty`, `my-feed-error`); waiting on the list-success
  // selector specifically also asserts the intercepted feed payload
  // matched the SPA's expected shape.
  captureAtAllViewports('/dashboard/community', 'community-feed', '[data-cy="my-feed-list"]');
  // The stats overview also has three terminal states. `stats-total`
  // wins over the empty + error states because the SPA aggregates from
  // the intercepted athletes list — landing in success is the only
  // visually meaningful state for a marketing screenshot.
  captureAtAllViewports('/dashboard/stats', 'stats-overview', '[data-cy="stats-total"]');
});
