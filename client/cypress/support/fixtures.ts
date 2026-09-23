// Shared fixtures used across Cypress specs. Centralised so adding a new
// field to an entity (e.g. Academy.logo_url in PR #92) is a single-file
// change instead of one across many specs.

import LADDERS from '../../src/test-utils/ladders.json';
import TRAINING_MODES from '../../src/test-utils/training-modes.json';

export const MOCK_ACADEMY = {
  id: 1,
  name: 'Test Academy',
  slug: 'test-academy',
  address: null,
  logo_url: null,
  // What it teaches, and its ladder (#1800/#1801): the SPA builds every belt
  // picker, filter and stripe cap from `grades`, so a mock without them
  // renders empty pickers. The ladder is the shared test fixture, which a
  // desktop spec keeps equal to the server's registry.
  martial_art: 'bjj',
  grades: LADDERS.bjj,
  training_modes: TRAINING_MODES.bjj,
  martial_art_locked: false,
  syllabus_programmes: ['bjj'],
} as const;

/** Standard `cy.intercept` body wrapper for the academy show endpoint. */
export const MOCK_ACADEMY_RESPONSE = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
} as const;

/**
 * Standard `cy.intercept` response stub for an empty athletes list.
 * Used by specs that need the athletes endpoint silenced without caring
 * about the actual roster (e.g. stats tabs, academy, auth flow tests).
 */
export const MOCK_ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
} as const;
