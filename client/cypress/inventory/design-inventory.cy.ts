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
  address: {
    line1: 'Via Roma 1',
    line2: null,
    city: 'Torino',
    postal_code: '10121',
    province: 'TO',
    country: 'IT',
  },
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
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1995-03-12',
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2024-09-01',
        created_at: '2024-09-01T10:00:00+00:00',
        attendance_month_count: 6,
        attendance_total_count: 41,
      },
      {
        id: 2,
        first_name: 'Matteo',
        last_name: 'Bonanno',
        email: 'matteobonanno1990@gmail.com',
        phone_country_code: null,
        phone_national_number: null,
        address: null,
        date_of_birth: '1990-05-15',
        belt: 'black',
        stripes: 2,
        status: 'active',
        joined_at: '2010-01-10',
        created_at: '2024-09-01T10:00:00+00:00',
        attendance_month_count: 2,
        attendance_total_count: 58,
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

/**
 * Frozen "now" for determinism. `ExpiryStatusBadge` + friends compute
 * relative to today; without freezing the clock, the stubbed expiry above
 * would flip between "expiring" → "expired" as real calendar days pass,
 * and screenshots would drift even when nothing in the codebase changed.
 *
 * Pick a date close to when this file was authored so the stubbed
 * expiry still reads as "expiring within 30 days" (which is the visual
 * state we want captured on the dashboard widget).
 */

// ── Fixtures for the rest of the app (#1497) ────────────────────────────
//
// The inventory shipped covering three pages. Everything below is what it
// takes to render the other fifty: every page in the SPA calls something,
// and a page that renders its error or empty state is not the page whose
// design we are reviewing.

const ATHLETE_ONE = {
  id: 1,
  first_name: 'Isabella',
  last_name: 'Conciarelli',
  email: 'isabella@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  address: null,
  date_of_birth: '1995-03-12',
  belt: 'blue',
  stripes: 2,
  status: 'active',
  joined_at: '2024-09-01',
  created_at: '2024-09-01T10:00:00+00:00',
  website: null,
  facebook: null,
  instagram: null,
  billing_period_months: 1,
  fee_tier_id: null,
  is_self: false,
  attendance_month_count: 6,
  attendance_total_count: 41,
};

const ME = {
  id: 1,
  first_name: 'Matteo',
  last_name: 'Bonanno',
  full_name: 'Matteo Bonanno',
  handle: 'matteo',
  email: 'matteo@example.com',
  email_verified_at: '2025-01-01T00:00:00+00:00',
  avatar_url: null,
  two_factor_enabled: false,
  role: 'owner',
};

const NOTIFICATIONS = [
  {
    id: 1,
    type: 'document_expiring',
    read_at: null,
    created_at: '2026-04-23T09:00:00+00:00',
    data: { athlete_name: 'Isabella Conciarelli', athlete_id: 1, days: 16 },
  },
  {
    id: 2,
    type: 'payment_overdue',
    read_at: '2026-04-22T09:00:00+00:00',
    created_at: '2026-04-20T09:00:00+00:00',
    data: { athlete_name: 'Matteo Bonanno', athlete_id: 2 },
  },
];

const FEE_TIERS = [
  { id: 1, name: 'Adulti', amount_cents: 5000, athlete_count: 12 },
  { id: 2, name: 'Ragazzi', amount_cents: 3500, athlete_count: 7 },
];

const ATTENDANCE_SUMMARY = [
  { athlete_id: 1, athlete_name: 'Isabella Conciarelli', count: 6 },
  { athlete_id: 2, athlete_name: 'Matteo Bonanno', count: 3 },
];

const ATTENDANCE_DAY = [
  { id: 1, athlete_id: 1, attended_on: '2026-04-24', created_at: '2026-04-24T18:00:00+00:00' },
  { id: 2, athlete_id: 2, attended_on: '2026-04-22', created_at: '2026-04-22T18:00:00+00:00' },
];

const PAYMENTS = [
  // `year` + `month`, not a date string: a payment covers a PERIOD since
  // #1382, and the component spreads it across the cells it pays for. A
  // wrong-shaped stub throws on `p.month` and takes the page down.
  { id: 1, athlete_id: 1, year: 2026, month: 4, period_months: 1, amount_cents: 5000 },
  { id: 2, athlete_id: 1, year: 2026, month: 1, period_months: 3, amount_cents: 15_000 },
];

const PROMOTIONS = [
  { id: 1, athlete_id: 1, belt: 'blue', stripes: 2, recorded_at: '2026-02-01' },
  { id: 2, athlete_id: 1, belt: 'white', stripes: 4, recorded_at: '2025-06-01' },
];

const STATS = {
  total: 19,
  by_belt: { white: 8, blue: 6, purple: 3, brown: 1, black: 1 },
  attendance_by_month: [
    { month: '2026-01', count: 42 },
    { month: '2026-02', count: 51 },
    { month: '2026-03', count: 47 },
    { month: '2026-04', count: 38 },
  ],
  paid: 14,
  unpaid: 5,
  revenue_cents: 70_000,
};

// Literal base date rather than FROZEN_NOW: this block is declared above it,
// and a `const` referenced before its own initialisation is a TDZ error that
// takes the whole file down before the first test runs.
const STATS_BASE = new Date('2026-04-24T12:00:00Z').getTime();

const STATS_ATTENDANCE_DAILY = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(STATS_BASE - (89 - i) * 86_400_000);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    // A believable week shape: quiet Sunday, busy Tuesday and Thursday.
    count: [0, 6, 11, 7, 12, 9, 3][d.getDay()],
  };
});

const STATS_PAYMENTS_MONTHLY = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  currency: 'EUR',
  amount_cents: 60_000 + i * 2_500,
}));

const STATS_AGE_BANDS = {
  bands: [
    { code: 'mighty_mite', category: 'kids', min: 4, max: 6, count: 3 },
    { code: 'pee_wee', category: 'kids', min: 7, max: 9, count: 5 },
    { code: 'junior', category: 'kids', min: 10, max: 12, count: 4 },
    { code: 'adult', category: 'adults', min: 18, max: 29, count: 9 },
    { code: 'master_1', category: 'adults', min: 30, max: 35, count: 6 },
  ],
  total: 27,
  missing_dob: 2,
};

const FEED = {
  data: [
    {
      id: 1,
      body: 'Seminario di guardia chiusa sabato alle 10:00. Portate la gi pulita.',
      created_at: '2026-04-23T18:00:00+00:00',
      author: { id: 1, full_name: 'Matteo Bonanno', handle: 'matteo', avatar_url: null },
      reactions: { clap: 4, pray: 1 },
      my_reaction: null,
      comments_count: 2,
      kind: 'text',
    },
  ],
  meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
};

const DOCUMENTS = {
  data: [
    {
      id: 42,
      athlete_id: 1,
      type: 'medical_certificate',
      original_name: 'certificato-medico.pdf',
      mime_type: 'application/pdf',
      size_bytes: 120_000,
      issued_at: '2025-04-24',
      expires_at: '2026-05-10',
      notes: null,
      cancelled_at: null,
      created_at: '2025-04-24T10:00:00+00:00',
    },
    {
      id: 43,
      athlete_id: 1,
      type: 'id_document',
      original_name: 'carta-identita.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 480_000,
      issued_at: '2022-01-10',
      expires_at: '2032-01-10',
      notes: null,
      cancelled_at: null,
      created_at: '2024-09-01T10:00:00+00:00',
    },
  ],
};

const SESSIONS = [
  {
    id: 1,
    ip_address: '81.0.0.1',
    user_agent: 'Chrome on Linux',
    last_used_at: '2026-04-24T09:00:00+00:00',
    created_at: '2026-04-01T09:00:00+00:00',
    current: true,
  },
];

const AUDIT = [
  {
    id: 1,
    action: 'athlete.updated',
    actor_name: 'Matteo Bonanno',
    subject_label: 'Isabella Conciarelli',
    created_at: '2026-04-23T11:00:00+00:00',
  },
];

const BACKUP = {
  last_backup_at: '2026-04-24T03:00:00+00:00',
  size_bytes: 2_400_000,
  location: 'C:\\Users\\matteo\\AppData\\Roaming\\Budojo',
  drive_connected: false,
};

const RUNTIME = {
  profile: 'web',
  capabilities: ['community', 'backup', 'athlete_accounts', 'email', 'web_push'],
};

const FROZEN_NOW = new Date('2026-04-24T12:00:00Z').getTime();

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
function seedIntercepts(role: 'owner' | 'athlete' = 'owner'): void {
  // Catch-all FIRST so a later, more specific intercept wins. Every page in
  // the app calls something; an unstubbed GET reaches the dev backend, which
  // rejects the fake token and bounces the whole run to /auth/login — and the
  // screenshot is then a login form under the wrong filename, which looks
  // like a design finding rather than a harness fault.
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });

  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES_TWO);
  cy.intercept('GET', '/api/v1/documents/expiring*', EXPIRING_ONE);
  cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE_ONE } });

  // The dashboard shell asks these on every authenticated route.
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
  cy.intercept('GET', '/api/v1/notifications*', { statusCode: 200, body: { data: NOTIFICATIONS } });
  cy.intercept('GET', '/api/v1/notifications/unread-count', {
    statusCode: 200,
    body: { data: { count: 2 } },
  });
  cy.intercept('GET', '/api/v1/academy/fee-tiers*', { statusCode: 200, body: { data: FEE_TIERS } });

  // Attendance, payments, stats: the numeric surfaces. An empty envelope
  // renders an empty state, which is a design surface worth capturing — but
  // the populated one is the surface people actually live in.
  cy.intercept('GET', '/api/v1/attendance/summary*', {
    statusCode: 200,
    body: { data: ATTENDANCE_SUMMARY },
  });
  cy.intercept('GET', '/api/v1/attendance*', { statusCode: 200, body: { data: ATTENDANCE_DAY } });
  // The leaderboard card reads `page.meta.month` straight out of the
  // subscribe with no guard, so the catch-all's bare `{ data: [] }` throws an
  // uncaught TypeError and takes the whole host page down — the stats
  // overview and the athlete's profile both.
  cy.intercept('GET', '/api/v1/attendance/leaderboard*', {
    statusCode: 200,
    body: {
      data: [
        { athlete_id: 1, full_name: 'Isabella Conciarelli', count: 11, rank: 1 },
        { athlete_id: 2, full_name: 'Matteo Bonanno', count: 8, rank: 2 },
      ],
      meta: { month: '2026-04', total: 2 },
    },
  });
  cy.intercept('GET', '/api/v1/athletes/*/payments*', {
    statusCode: 200,
    body: { data: PAYMENTS },
  });
  cy.intercept('GET', '/api/v1/athletes/*/attendance*', {
    statusCode: 200,
    body: { data: ATTENDANCE_DAY },
  });
  cy.intercept('GET', '/api/v1/athletes/*/documents*', { statusCode: 200, body: DOCUMENTS });
  cy.intercept('GET', '/api/v1/athletes/*/promotions*', {
    statusCode: 200,
    body: {
      data: PROMOTIONS,
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 2, total: 2 },
    },
  });
  // Three separate endpoints with three different shapes, so one blanket
  // stub cannot serve them: a wrong-shaped 200 leaves the page in its
  // skeleton forever, which is not a state worth photographing.
  cy.intercept('GET', '/api/v1/stats/attendance/daily*', {
    statusCode: 200,
    body: { data: STATS_ATTENDANCE_DAILY },
  });
  cy.intercept('GET', '/api/v1/stats/payments/monthly*', {
    statusCode: 200,
    body: { data: STATS_PAYMENTS_MONTHLY },
  });
  cy.intercept('GET', '/api/v1/stats/athletes/age-bands', {
    statusCode: 200,
    body: { data: STATS_AGE_BANDS },
  });

  // Community feed + the athlete portal's own surfaces.
  cy.intercept('GET', '/api/v1/community/**', { statusCode: 200, body: FEED });
  // The role decides which app you are in. `/dashboard/me/*` sits behind
  // `roleAthleteGuard`, so an owner is redirected out of it — and the
  // redirect target has an `<h1>` too, which means a portal page shot with an
  // owner is a picture of the roster filed under the portal's name. That is
  // worse than a missing screenshot: it looks like a finding.
  const me = { ...ME, role };
  cy.intercept('GET', '/api/v1/auth/me', { statusCode: 200, body: { data: me } });
  cy.intercept('GET', '/api/v1/me', { statusCode: 200, body: { data: me } });
  cy.intercept('GET', '/api/v1/me/**', { statusCode: 200, body: { data: [] } });

  // Profile sub-cards.
  cy.intercept('GET', '/api/v1/user/sessions*', { statusCode: 200, body: { data: SESSIONS } });
  cy.intercept('GET', '/api/v1/user/login-history*', { statusCode: 200, body: { data: SESSIONS } });
  cy.intercept('GET', '/api/v1/user/api-tokens*', { statusCode: 200, body: { data: [] } });
  // Both of these read `meta` off the envelope and throw without it — the
  // catch-all's bare `{ data: [] }` is not a shape either page survives.
  cy.intercept('GET', '/api/v1/audit-entries*', {
    statusCode: 200,
    body: {
      data: AUDIT,
      meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
    },
  });
  cy.intercept('GET', '/api/v1/backup/**', { statusCode: 200, body: { data: BACKUP } });
  cy.intercept('GET', '/api/v1/runtime', { statusCode: 200, body: { data: RUNTIME } });
}

// ── Capture helpers ─────────────────────────────────────────────────────

/**
 * Render the page at every viewport and capture one screenshot per.
 * Filename format: `{slug}__{viewport}.png` — predictable, diffable,
 * sortable. Example: `dashboard-academy-detail__mobile.png`.
 *
 * `readySelector` is an app-owned `data-cy` that must be visible before
 * we capture — avoids the pre-Copilot-feedback flakiness of a fixed
 * `cy.wait(400)` which varies by machine / Angular bootstrap time.
 */
function captureAtAllViewports(
  route: string,
  slug: string,
  readySelector: string,
  authenticated = true,
  role: 'owner' | 'athlete' = 'owner',
): void {
  VIEWPORTS.forEach((vp: Viewport) => {
    it(`${slug} @ ${vp.name} (${vp.width}×${vp.height})`, () => {
      cy.viewport(vp.width, vp.height);
      seedIntercepts(role);
      // Freeze time BEFORE Angular bootstraps so ExpiryStatusBadge computes
      // relative to FROZEN_NOW, not wall-clock. `onBeforeLoad` is the
      // earliest hook Cypress exposes; `cy.clock` inside the test body
      // would land after Angular's first change-detection cycle and miss
      // the initial render.
      const freeze = {
        onBeforeLoad(win: Cypress.AUTWindow) {
          win.Date.now = () => FROZEN_NOW;
          // Public pages render the cookie banner, a sticky overlay that
          // covers the foot of every one of them. It is worth reviewing once,
          // on its own; on sixteen legal pages it is just a mask.
          win.localStorage.setItem(
            'budojoCookieConsent',
            JSON.stringify({ version: 1, choices: { analytics: false }, savedAt: FROZEN_NOW }),
          );
          win.localStorage.setItem('budojoLang', 'en');
        },
      };
      if (authenticated) {
        cy.visitAuthenticated(route, undefined, freeze);
      } else {
        // A signed-out visit, because that is the state these pages are for.
        // `visitAuthenticated` would seed a token and send the landing page
        // and the auth forms straight to the dashboard.
        cy.visit(route, { failOnStatusCode: false, ...freeze });
      }
      // Wait on an app-rendered signal instead of a fixed duration.
      cy.get(readySelector, { timeout: 8000 }).should('be.visible');

      // ...and then wait for the page to stop LOADING. A ready selector is
      // usually static chrome — a tab bar, a header button — which exists
      // before the data does, so the shutter fired on skeletons: the stats
      // overview came out as a blank grey rectangle and the roster as an
      // empty table. An inventory of loading states is worse than no
      // inventory, because every one of them reads as a design fault.
      //
      // The app names these consistently, which is what makes a blanket
      // assertion possible: `data-cy` ending in `-skeleton` or `-loading`,
      // plus PrimeNG's own `.p-skeleton`.
      cy.wait(250); // let a late spinner mount before deciding it is absent
      cy.get('body').then(($body) => {
        // `.pi-spin` catches the pages that show a spinning glyph instead of
        // a skeleton — the athlete detail is one, and without it all four of
        // its tabs came out as "Loading athlete…".
        const pending =
          '[data-cy$="-skeleton"], [data-cy$="-loading"], .p-skeleton, .pi-spin, .p-progressspinner';
        if ($body.find(pending).length > 0) {
          cy.get(pending, { timeout: 8000 }).should('not.exist');
        }
      });
      cy.screenshot(`${slug}__${vp.name}`, {
        capture: 'fullPage',
        overwrite: true,
      });
    });
  });
}

/** A page inside the athlete's own portal, which an owner cannot reach. */
function portalPage(route: string, slug: string, readySelector: string): void {
  captureAtAllViewports(route, slug, readySelector, true, 'athlete');
}

/** The signed-out surfaces: landing, auth, legal, error pages. */
function publicPage(route: string, slug: string, readySelector: string): void {
  captureAtAllViewports(route, slug, readySelector, false);
}

// ── Inventory ───────────────────────────────────────────────────────────

describe('Design inventory — visual reference', () => {
  // ── Public + auth ──────────────────────────────────────────────────────
  // These carry their own branding, which predates the design system and was
  // the reason the PoC skipped them. That is exactly why they belong in an
  // inventory: a surface nobody looks at is a surface that drifts.
  publicPage('/', 'public-landing', '[data-cy="landing-lang-toggle"]');
  publicPage('/auth/login', 'auth-login', 'form');
  publicPage('/auth/register', 'auth-register', 'form');
  publicPage('/auth/forgot-password', 'auth-forgot-password', 'form');
  publicPage('/auth/reset-password?token=x&email=a@b.c', 'auth-reset-password', 'main, form');
  publicPage('/auth/verify-success', 'auth-verify-success', '[data-cy="verify-success-go"]');
  publicPage('/auth/verify-error', 'auth-verify-error', 'h1');
  publicPage('/help', 'public-help', '[data-cy="help-search-input"]');
  publicPage('/privacy', 'public-privacy', '[data-cy="privacy-lang-toggle"]');
  publicPage('/terms', 'public-terms', '[data-cy="terms-lang-toggle"]');
  publicPage('/cookie-policy', 'public-cookie-policy', '[data-cy="cookie-lang-toggle"]');
  publicPage('/sub-processors', 'public-sub-processors', '[data-cy="sub-processors-lang-toggle"]');
  publicPage(
    '/account-deletion',
    'public-account-deletion',
    '[data-cy="account-deletion-lang-toggle"]',
  );
  publicPage('/offline', 'error-offline', '[data-cy="offline-retry"]');
  publicPage('/error', 'error-server', '[data-cy="server-error-retry"]');
  publicPage('/unsubscribed', 'error-unsubscribed', '[data-cy="unsubscribe-page"]');
  publicPage('/no-such-page', 'error-not-found', '[data-cy="not-found-cta"]');

  // ── Athletes — the screen the app is really about ──────────────────────
  // Ready on a ROW, not on the header button. The button exists before the
  // list resolves, so the shutter fired on an empty table and the inventory's
  // headline page was a picture of a loading state.
  captureAtAllViewports(
    '/dashboard/athletes',
    'athletes-list',
    '.athletes-table__row--muted, [data-cy="athlete-status-1"], [data-cy="athlete-card-1"], td',
  );
  captureAtAllViewports('/dashboard/athletes/new', 'athletes-create', '[data-cy="athlete-form"]');
  // The athlete's name, not a field in the form. At desktop the form sits
  // below a scrolling ancestor's visible area — three account cards and a tab
  // strip come first — so Cypress reports every element in it as not visible.
  // That is the harness meeting the same problem a reader does; see the
  // below-the-fold finding in the audit rather than fighting it here.
  captureAtAllViewports('/dashboard/athletes/1/edit', 'athletes-edit', 'h1');
  captureAtAllViewports('/dashboard/athletes/import', 'athletes-import', '[data-cy="import-back"]');
  captureAtAllViewports(
    '/dashboard/athletes/1/documents',
    'athlete-documents',
    '[data-cy="athlete-detail-back"]',
  );
  captureAtAllViewports(
    '/dashboard/athletes/1/attendance',
    'athlete-attendance',
    '[data-cy="athlete-detail-back"]',
  );
  captureAtAllViewports(
    '/dashboard/athletes/1/payments',
    'athlete-payments',
    '[data-cy="athlete-detail-back"]',
  );
  captureAtAllViewports(
    '/dashboard/athletes/1/promotions',
    'athlete-promotions',
    '[data-cy="athlete-detail-back"]',
  );
  captureAtAllViewports(
    '/dashboard/documents/expiring',
    'documents-expiring',
    '[data-cy="back-to-athletes"]',
  );

  // ── Academy ────────────────────────────────────────────────────────────
  captureAtAllViewports('/dashboard/academy', 'academy-detail', '[data-cy="academy-detail"]');
  captureAtAllViewports('/dashboard/academy/edit', 'academy-edit', '[data-cy="academy-form"]');
  captureAtAllViewports(
    '/dashboard/academy/activity',
    'academy-activity',
    '[data-cy="audit-filters"]',
  );

  // ── Attendance ─────────────────────────────────────────────────────────
  captureAtAllViewports('/dashboard/attendance', 'attendance-daily', 'h1');
  captureAtAllViewports(
    '/dashboard/attendance/summary',
    'attendance-summary',
    '[data-cy="monthly-summary-page"]',
  );

  // ── Stats ──────────────────────────────────────────────────────────────
  captureAtAllViewports('/dashboard/stats/overview', 'stats-overview', '[data-cy="stats-tabs"]');
  captureAtAllViewports(
    '/dashboard/stats/attendance',
    'stats-attendance',
    '[data-cy="stats-tabs"]',
  );
  captureAtAllViewports('/dashboard/stats/payments', 'stats-payments', '[data-cy="stats-tabs"]');
  captureAtAllViewports('/dashboard/stats/athletes', 'stats-athletes', '[data-cy="stats-tabs"]');

  // ── Account + shell ────────────────────────────────────────────────────
  captureAtAllViewports('/dashboard/profile', 'profile', 'h1');
  captureAtAllViewports('/dashboard/more', 'owner-more', '[data-cy="owner-more"]');
  captureAtAllViewports('/dashboard/notifications', 'notifications', 'h1');
  captureAtAllViewports('/dashboard/whats-new', 'whats-new', 'h1');
  captureAtAllViewports('/dashboard/community', 'community-feed', 'h1');
  // Backup is deliberately absent. Its summary comes from the Electron
  // preload bridge (`desktop-backup.service`), not over HTTP, so in a browser
  // the page sits in a permanent loading state — a screenshot of which would
  // be a picture of the harness rather than of the design. Capturing it needs
  // the packaged app, which is a different tool.
  captureAtAllViewports('/dashboard/support', 'support', '[data-cy="support-form"]');

  // ── The athlete's own portal ───────────────────────────────────────────
  // A whole second app behind /dashboard/me, and the one the inventory has
  // never once looked at.
  portalPage('/dashboard/me/profile', 'me-profile', '[data-cy="me-profile-card"]');
  portalPage('/dashboard/me/feed', 'me-feed', 'h1');
  portalPage('/dashboard/me/academy', 'me-academy', 'h1');
  portalPage('/dashboard/me/attendance', 'me-attendance', 'h1');
  portalPage('/dashboard/me/attendance/today', 'me-attendance-today', 'h1');
  portalPage('/dashboard/me/payments', 'me-payments', 'h1');
  portalPage('/dashboard/me/documents', 'me-documents', 'h1');
  portalPage('/dashboard/me/notifications', 'me-notifications', 'h1');
  portalPage('/dashboard/me/more', 'me-more', '[data-cy="me-more"]');
});
