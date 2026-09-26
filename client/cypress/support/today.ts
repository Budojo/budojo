/**
 * Defensive stubs for Today (#1643), the screen every sign-in now lands on.
 *
 * Today asks its endpoints on mount. A spec whose flow merely passes through
 * `/dashboard` (a login, the end of setup, a "back" CTA) does not care what
 * they answer, but an unstubbed one falls through the dev proxy: in CI that
 * is an error the page absorbs, locally it can be a 401 from a real API that
 * logs the spec out a few assertions later (see `.claude/gotchas.md` →
 * "unhandled 401 on a background probe"). Call this in the `beforeEach` of
 * any such spec; stubs registered after it still win.
 */
export function stubToday(): void {
  // The getting-started tour lives on Today (#1755). Dismissed, so a spec
  // that only passes through sees the cards, not the checklist.
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-01-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/lessons/suggestions*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/documents/expiring*', {
    statusCode: 200,
    body: { data: [], missing_medical_certificate: [] },
  });
  cy.intercept('GET', '/api/v1/stats/attendance/daily*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
    statusCode: 200,
    body: {
      data: {
        season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
        kind: null,
        totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
        positions: [],
        missing: [],
        taught: [],
      },
    },
  });
}
