// Shared fixtures used across Cypress specs. Centralised so adding a new
// field to an entity (e.g. Academy.logo_url in PR #92) is a single-file
// change instead of one across many specs.

export const MOCK_ACADEMY = {
  id: 1,
  name: 'Test Academy',
  slug: 'test-academy',
  address: null,
  logo_url: null,
} as const;

/** Standard `cy.intercept` body wrapper for the academy show endpoint. */
export const MOCK_ACADEMY_RESPONSE = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
} as const;
