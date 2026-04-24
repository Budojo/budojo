/*
 * Design inventory — visual reference library.
 *
 * This is NOT a test. It visits every canonical page at three viewport
 * widths (mobile / tablet / desktop) and captures a screenshot per
 * combination. Output lands in `docs/design/screenshots/` (configured in
 * `cypress.config.ts`) and is committed to the repo, so the team always
 * has an up-to-date visual inventory to compare against when building a
 * new feature.
 *
 * Run with:  npm run design:inventory
 *
 * Playbook when adding a new feature (e.g. M4 Attendance):
 *   1. Pick tokens/patterns from docs/design/DESIGN_SYSTEM.md.
 *   2. Build the screen using existing patterns.
 *   3. Add a `page('route', 'slug')` call below.
 *   4. Run `npm run design:inventory` → new screenshots appear.
 *   5. Diff against the existing inventory — if your screen needs a
 *      pattern the system doesn't have yet (e.g. a calendar cell),
 *      go back to Claude Design with the gap.
 *
 * Deterministic intercepts keep screenshots byte-stable across runs;
 * re-running without a UI change should produce zero git diff.
 */
export {};

// ── Canonical stubs ─────────────────────────────────────────────────────

const ACADEMY = {
  id: 1,
  name: 'Gracie Barra Torino',
  slug: 'gracie-barra-torino-a1b2c3d4',
  address: 'Via Roma 1, 10121 Torino',
};

const ATHLETES_TWO = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 1,
        first_name: 'Isabella',
        last_name: 'Conciarelli',
        email: null,
        phone: null,
        date_of_birth: '1995-03-12',
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2024-09-01',
        created_at: '2024-09-01T10:00:00+00:00',
      },
      {
        id: 2,
        first_name: 'Matteo',
        last_name: 'Bonanno',
        email: 'matteobonanno1990@gmail.com',
        phone: null,
        date_of_birth: '1990-05-15',
        belt: 'black',
        stripes: 2,
        status: 'active',
        joined_at: '2010-01-10',
        created_at: '2024-09-01T10:00:00+00:00',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      path: '',
      per_page: 20,
      to: 2,
      total: 2,
    },
  },
};

const EXPIRING_ONE = {
  statusCode: 200,
  body: {
    data: [
      {
        id: 42,
        athlete_id: 1,
        type: 'medical_certificate',
        original_name: 'certificato.pdf',
        mime_type: 'application/pdf',
        size_bytes: 120_000,
        issued_at: '2025-04-24',
        expires_at: '2026-05-10',
        notes: null,
        created_at: '2025-04-24T10:00:00+00:00',
      },
    ],
  },
};

// ── Viewports ───────────────────────────────────────────────────────────

/**
 * Three viewports cover the canon's breakpoints (mobile / tablet / desktop).
 * Heights are deliberately tall enough that most pages fit without a
 * scrollbar artifact — `cy.screenshot()` defaults to full-page capture
 * anyway, but a clean initial viewport avoids media-query ambiguity
 * around the tail end of scrollable content.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

type Viewport = (typeof VIEWPORTS)[number];

// ── Intercepts shared across pages ──────────────────────────────────────

/**
 * Every authenticated route eventually hydrates the academy cache via
 * `hasAcademyGuard`, plus the dashboard widget fires the expiring docs
 * list. Stubbing them here keeps the inventory deterministic and avoids
 * getaddrinfo noise when the spec runs without the backend container.
 */
function seedIntercepts(): void {
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO);
  cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_ONE);
}

// ── Capture helpers ─────────────────────────────────────────────────────

/**
 * Render the page at every viewport and capture one screenshot per.
 * Filename format: `{slug}__{viewport}.png` — predictable, diffable,
 * sortable. Example: `dashboard-academy__mobile.png`.
 */
function captureAtAllViewports(route: string, slug: string): void {
  VIEWPORTS.forEach((vp: Viewport) => {
    it(`${slug} @ ${vp.name} (${vp.width}×${vp.height})`, () => {
      cy.viewport(vp.width, vp.height);
      seedIntercepts();
      cy.visitAuthenticated(route);
      // Let the Angular animation async settle + fonts load. A tiny wait
      // is pragmatic here; waiting on network would be fragile because
      // not every page fires the same set of requests.
      cy.wait(400);
      cy.screenshot(`${slug}__${vp.name}`, {
        capture: 'fullPage',
        overwrite: true,
      });
    });
  });
}

// ── Inventory ───────────────────────────────────────────────────────────

describe('Design inventory — visual reference', () => {
  // --- Auth surfaces -------------------------------------------------------
  // Skipped for the PoC: these use their own branding (purple/pink)
  // that predates the design system and are queued for a separate refactor.
  // Add back once the auth pass lands.

  // --- Academy -------------------------------------------------------------
  captureAtAllViewports('/dashboard/academy', 'dashboard-academy-detail');
  captureAtAllViewports('/dashboard/academy/edit', 'dashboard-academy-edit');

  // --- Athletes ------------------------------------------------------------
  captureAtAllViewports('/dashboard/athletes', 'dashboard-athletes-list');
});
