import './commands';

// Default `GET /api/v1/auth/me` mock — the dashboard shell calls
// `loadCurrentUser()` on init, and a network failure on that side-effect
// trips the global `errorInterceptor` (#425) which renders
// `<app-offline>` in place of the page under test (the dev server's
// `/api` proxy fails in CI because no backend is wired). Registered in
// a global `beforeEach` so it runs BEFORE any test-file `beforeEach` —
// any spec that needs a custom `/me` (Mario Rossi for profile-mobile,
// an unverified user for the verification banner spec, etc.) registers
// its own intercept later and Cypress matches the most-recent
// registration. This default only catches the otherwise-unmocked case.
// Default `GET /api/v1/runtime` mock. Every capability-gated route awaits
// `RuntimeService.load()` before activating, so an unmocked runtime call means
// the guard waits for a request that has to fail on its own — and how long
// that takes depends on how the backend is absent. On CI the proxy target does
// not resolve and it fails fast; locally, with the `api` container merely
// stopped, the connection is refused more slowly and the wait can outlast the
// spec. `public-profile.cy.ts` sat on that difference until the Angular 22
// upgrade made it slower still.
//
// The web capability set is the app's own optimistic default, so this default
// changes nothing a spec was relying on — it just stops the clock. A spec that
// needs the desktop profile registers its own later, as
// `desktop-capabilities.cy.ts` does.
beforeEach(() => {
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: {
      data: {
        profile: 'web',
        // `ALL_CAPABILITIES` from `runtime.service.ts`, which is also the
        // app's optimistic web default — so this changes nothing a spec was
        // relying on.
        capabilities: [
          'community',
          'athlete_accounts',
          'web_push',
          'email',
          'password_breach_check',
        ],
      },
    },
  });
});

// Default `GET /api/v1/academy/fee-tiers` mock (#1381) — the academy form and
// the athlete form both load the price list on init. An empty list is the
// state of every academy that charges one flat fee, so it is also the right
// default here: the tier field simply doesn't render. Same override rule as
// `/me` above — a spec that needs actual tiers registers its own later.
beforeEach(() => {
  cy.intercept('GET', '/api/v1/academy/fee-tiers*', {
    statusCode: 200,
    body: { data: [] },
  });
});

// Default `GET /api/v1/academy/documents` mock (#1781) — the academy page
// lists the academy's own papers on init. Unmocked, the call fails through the
// dead proxy and the page raises "Could not load documents", a toast that lands
// over the header's Edit button whenever it beats the spec's click. That race
// was the academy.cy.ts flake the failure screenshots caught (#2001). No papers
// is the state of a new academy; a spec that needs some registers its own.
beforeEach(() => {
  cy.intercept('GET', '/api/v1/academy/documents*', {
    statusCode: 200,
    body: { data: [] },
  });
});

// Default `GET /api/v1/stats/syllabus/calendar` mock (#1940) — the timetable
// header's "send the week" button reads the calendar on init, so every spec
// that opens the timetable would otherwise trip the offline takeover in CI.
// An empty season: nothing planned, which is also the button's quiet state
// when the academy has no classes. Specs that need lessons (the season map,
// lesson topics, the send-the-week case) register their own, which wins.
beforeEach(() => {
  cy.intercept('GET', '/api/v1/stats/syllabus/calendar*', {
    statusCode: 200,
    body: {
      data: {
        season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
        kind: null,
        today: '2026-09-14',
        weeks: [],
        positions: [],
        lessons: [],
      },
    },
  });
});

beforeEach(() => {
  cy.intercept('GET', '/api/v1/auth/me*', {
    statusCode: 200,
    body: {
      data: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        email_verified_at: '2026-01-01T00:00:00Z',
        avatar_url: null,
      },
    },
  });
});

// Default `PATCH /api/v1/me/locale` mock (#1912). The SPA tells the server its
// language as soon as a signed-in user loads with one the server has not
// heard, which is every fixture user above. Unmocked, it reaches whatever is
// listening: nothing in CI, but a local API answers 401 and the app signs the
// test out. Echoes the language back, as the server does.
beforeEach(() => {
  cy.intercept('PATCH', '/api/v1/me/locale', (req) => {
    req.reply({ statusCode: 200, body: { data: { locale: req.body.locale } } });
  });
});
