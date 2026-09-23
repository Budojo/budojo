/**
 * The athlete portal draws belts from the athlete's own academy (#1813).
 *
 * The portal's routes never load the owner-side academy, so before this a
 * judo athlete saw BJJ's words for their belts: "Green (kids)" where their
 * academy says "Green". The portal shell now loads `/me/academy`, which
 * carries the martial art and its ladder.
 */

import LADDERS from '../../src/test-utils/ladders.json';
import TRAINING_MODES from '../../src/test-utils/training-modes.json';

const ATHLETE_ME = {
  statusCode: 200,
  body: {
    data: {
      id: 2,
      first_name: 'Aiko',
      last_name: 'Sato',
      full_name: 'Aiko Sato',
      handle: 'aiko',
      email: 'aiko@example.com',
      email_verified_at: '2026-01-01T00:00:00Z',
      avatar_url: null,
      role: 'athlete',
    },
  },
};

const JUDO_ACADEMY = {
  statusCode: 200,
  body: {
    data: {
      id: 1,
      name: 'Dojo Kaizen',
      slug: 'dojo-kaizen',
      address: null,
      logo_url: null,
      training_days: null,
      owner: null,
      martial_art: 'judo',
      grades: LADDERS.judo,
      training_modes: TRAINING_MODES.judo,
    },
  },
};

const PEER = {
  statusCode: 200,
  body: {
    data: {
      id: 42,
      first_name: 'Kenji',
      handle: 'kenji',
      avatar_url: null,
      belt: 'green',
      joined_at: '2025-01-15',
      promotions: [],
      achievements: [],
    },
  },
};

describe('Athlete portal — belts in the academy own words (#1813)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/auth/me*', ATHLETE_ME);
    cy.intercept('GET', '/api/v1/me/academy', JUDO_ACADEMY).as('myAcademy');
    cy.intercept('GET', '/api/v1/users/kenji/profile', PEER).as('peer');
  });

  it("reads a judo green belt as judo's green, not BJJ's kids' green", () => {
    cy.visitAuthenticated('/dashboard/me/u/kenji');
    cy.wait('@myAcademy');
    cy.wait('@peer');

    cy.get('.public-profile-meta app-belt-badge')
      .should('contain.text', 'Green')
      .and('not.contain.text', 'kids');
  });
});
