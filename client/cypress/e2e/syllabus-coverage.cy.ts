import { MOCK_ACADEMY } from '../support/fixtures';
import { VIEWPORT_IPHONE_SE } from '../support/viewports';

/**
 * Syllabus coverage (#1565).
 *
 * Every call is intercepted, so what this proves is the client wiring: that
 * the headline and the three-way tally render, that the filter and the season
 * stepper re-ask the server with the right query, and that an academy with no
 * programme is told what to do rather than shown a 0%.
 */

const ACADEMY = { ...MOCK_ACADEMY, season_label: '2026/27' };

/**
 * Wednesday 14 October 2026 at noon, the calendar's `today`. Planning reads
 * the local clock too, so a planning case left on the real one would stop
 * passing the week its dates went by.
 */
const WEDNESDAY_NOON = new Date(2026, 9, 14, 12, 0).getTime();

/** Monday gi fundamentals and Wednesday no-gi: where a plan can go. */
const CLASSES = [
  { id: 7, name: 'Fundamentals', weekday: 1, starts_at: '19:00', duration_minutes: 60, kind: 'gi' },
  { id: 8, name: 'No-gi', weekday: 3, starts_at: '19:00', duration_minutes: 60, kind: 'nogi' },
];

/** The programme the lesson sheet opens on: half guard, and knee shield under it. */
const HALF_GUARD_PROGRAMME = [
  {
    id: 2,
    parent_id: null,
    name: 'Half guard',
    kind: 'both',
    in_season: true,
    sort_order: 0,
    children: [
      {
        id: 21,
        parent_id: 2,
        name: 'Knee shield',
        kind: 'gi',
        in_season: true,
        sort_order: 0,
      },
    ],
  },
];

/**
 * Landing on `/dashboard/stats` opens the overview tab, which reads the
 * paginated athletes endpoint — a bare `{ data: [] }` has no `meta` and the
 * page throws on `meta.last_page` before this spec gets anywhere.
 */
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

function position(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Closed guard',
    kind: 'both',
    in_scope: 6,
    covered: 3,
    thin: 1,
    missing: 2,
    worked: 0,
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    totals: { in_scope: 10, covered: 4, thin: 2, missing: 4, percentage: 40 },
    positions: [
      position(),
      position({
        id: 2,
        name: 'Half guard',
        in_scope: 4,
        covered: 1,
        thin: 1,
        missing: 2,
        worked: 2,
      }),
    ],
    missing: [
      { id: 31, name: 'Omoplata', parent_name: 'Closed guard', kind: 'both' },
      { id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
    ],
    taught: [
      {
        id: 11,
        name: 'Armbar',
        parent_name: 'Closed guard',
        kind: 'both',
        lessons: 3,
        reach: 11,
        attendances: 24,
        last_taught_on: '2026-10-05',
        state: 'covered',
      },
    ],
    timeline: [
      { on: '2026-09-06', covered: 0 },
      { on: '2026-09-13', covered: 2 },
      { on: '2026-09-20', covered: 4 },
    ],
    ...over,
  };
}

/** The season map (#1858): two positions over three weeks around "today". */
function calendar(over: Record<string, unknown> = {}) {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    today: '2026-10-14',
    weeks: ['2026-10-05', '2026-10-12', '2026-10-19'],
    positions: [
      {
        id: 1,
        name: 'Closed guard',
        kind: 'both',
        cells: [
          { week: '2026-10-05', held: 2, planned: 0, unconfirmed: 0 },
          { week: '2026-10-19', held: 0, planned: 1, unconfirmed: 0 },
        ],
      },
      { id: 2, name: 'Half guard', kind: 'both', cells: [] },
    ],
    lessons: [
      {
        id: 40,
        academy_class_id: 7,
        held_on: '2026-10-05',
        name: 'Fundamentals',
        starts_at: '19:00',
        kind: 'gi',
        state: 'held',
        position_ids: [1],
        topics: [{ id: 11, name: 'Armbar', parent_id: 1 }],
      },
      {
        id: 41,
        academy_class_id: 7,
        held_on: '2026-10-07',
        name: 'Advanced',
        starts_at: '20:30',
        kind: 'gi',
        state: 'held',
        position_ids: [1],
        topics: [{ id: 12, name: 'Triangle', parent_id: 1 }],
      },
      {
        id: 42,
        academy_class_id: 7,
        held_on: '2026-10-19',
        name: 'Fundamentals',
        starts_at: '19:00',
        kind: 'gi',
        state: 'planned',
        position_ids: [1],
        topics: [{ id: 1, name: 'Closed guard', parent_id: null }],
      },
    ],
    ...over,
  };
}

function stub(
  data: Record<string, unknown> = report(),
  academy: Record<string, unknown> = ACADEMY,
): void {
  cy.clearLocalStorage();
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: academy } });
  cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
  cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', { statusCode: 200, body: { data } }).as(
    'coverage',
  );
  cy.intercept('GET', '/api/v1/stats/syllabus/calendar*', {
    statusCode: 200,
    body: { data: calendar() },
  }).as('calendar');
}

describe('Syllabus coverage', () => {
  it('leads with the percentage, the fraction and the three-way split', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage').its('request.url').should('contain', 'seasons_back=0');

    cy.get('[data-cy="syllabus-coverage-percentage"]').should('contain.text', '40');
    cy.get('[data-cy="syllabus-coverage"]').should(
      'contain.text',
      "4 of 10 in the season's programme, each taught at least twice",
    );

    cy.get('[data-cy="syllabus-coverage-totals"]')
      .should('contain.text', '4 covered')
      .and('contain.text', '2 taught once')
      .and('contain.text', '4 not taught');

    // The position axis is the primary view: it is what exposes real gaps.
    // Each row keeps its fraction at the end of its weeks (#1858).
    cy.get('[data-cy="syllabus-position-1"]')
      .should('contain.text', 'Closed guard')
      .and('contain.text', '3/6');
    cy.get('[data-cy="syllabus-position-2"]').should('contain.text', '1/4');

    cy.get('[data-cy="syllabus-coverage-missing"]').should('contain.text', 'Omoplata');
    cy.get('[data-cy="syllabus-coverage-taught"]').should('contain.text', 'Armbar');
    // How many people it reached, beside how many lessons (#1746).
    cy.get('[data-cy="syllabus-taught-11"] [data-cy="syllabus-taught-reach"]').should(
      'contain.text',
      '3 lessons · 11 people',
    );
  });

  it('lays each position out week by week, and opens a week on the lessons it counts (#1858)', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar').its('request.url').should('contain', 'seasons_back=0');

    // Taught twice in the first week, nothing in the second, planned in the third.
    cy.get('[data-cy="syllabus-position-1"] .swatch').should('have.length', 3);
    cy.get('[data-cy="season-map-cell-1-2026-10-05"]').should('have.class', 'swatch--more');
    cy.get('[data-cy="season-map-cell-1-2026-10-19"]').should('have.class', 'swatch--planned');
    // A week with nothing on it is not a control.
    cy.get('[data-cy="syllabus-position-2"] td button').should('not.exist');

    cy.get('[data-cy="season-map-cell-1-2026-10-19"]').click();
    cy.get('[data-cy="season-map-popover"]')
      .should('contain.text', 'Fundamentals')
      .and('contain.text', 'Planned')
      .and('contain.text', 'Closed guard');
  });

  it('moves the popover to the second week opened, not only its content', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    cy.get('[data-cy="season-map-cell-1-2026-10-05"]').click();
    cy.get('[data-cy="season-map-popover"]').should('contain.text', 'Advanced');

    cy.get('[data-cy="season-map-cell-1-2026-10-19"]').click();
    cy.get('[data-cy="season-map-popover"]').should('contain.text', 'Planned');

    // PrimeNG's show() leaves an open popover where it was; it must follow.
    cy.get('[data-cy="season-map-cell-1-2026-10-19"]').then(($cell) => {
      const cell = $cell[0].getBoundingClientRect();
      cy.get('.p-popover').should(($pop) => {
        const pop = $pop[0].getBoundingClientRect();
        expect(Math.abs(pop.left - cell.left)).to.be.lessThan(32);
      });
    });
  });

  it("opens a position's whole season from its name, and takes focus there", () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    cy.get('[data-cy="season-map-position-1"]').focus().type('{enter}');
    cy.get('[data-cy="season-map-popover"]')
      .should('contain.text', 'Closed guard, this season')
      .and('contain.text', 'Week of')
      .and('contain.text', 'Armbar')
      .and('contain.text', 'Planned');
    cy.focused().should('have.id', 'season-map-pop-title');

    // Escape hands focus back to the name that opened it.
    cy.focused().type('{esc}');
    cy.focused().should('have.attr', 'data-cy', 'season-map-position-1');
  });

  it("opens a position's season as a bottom sheet on a phone, with a fingertip-sized name", () => {
    cy.viewport(VIEWPORT_IPHONE_SE.width, VIEWPORT_IPHONE_SE.height);
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    cy.get('[data-cy="season-map-position-1"]').click();
    cy.get('.p-drawer [data-cy="season-map-popover"]')
      .should('be.visible')
      .and('contain.text', 'Closed guard, this season');
    cy.focused().should('have.id', 'season-map-drawer-title');
    // A modal dialog with a name, not PrimeNG's nameless `complementary`.
    cy.get('.p-drawer')
      .should('have.attr', 'role', 'dialog')
      .and('have.attr', 'aria-modal', 'true')
      .and('have.attr', 'aria-labelledby', 'season-map-drawer-title');
    cy.screenshot('season-map-sheet-375', { capture: 'viewport', overwrite: true });
  });

  it('draws the map for a season with only plans on it, above the nothing-taught state', () => {
    stub(report({ taught: [] }));

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    cy.get('[data-cy="syllabus-coverage-nothing-taught"]').should('be.visible');
    cy.get('[data-cy="season-map-cell-1-2026-10-19"]').should('have.class', 'swatch--planned');
  });

  it('plans a lesson from a week still to come, and opens it on the position (#1859)', () => {
    stub();
    cy.clock(WEDNESDAY_NOON, ['Date']);
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [CLASSES[0]] },
    });
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: HALF_GUARD_PROGRAMME },
    });
    cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } }).as(
      'lesson',
    );

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    // Half guard has nothing on the map; the week of the 19th is still to come.
    cy.get('[data-cy="season-map-cell-2-2026-10-19"]').click();
    cy.get('[data-cy="season-map-plan"]').should('contain.text', 'Fundamentals');
    cy.get('[data-cy="season-map-plan-7-2026-10-19"]').click();

    cy.wait('@lesson')
      .its('request.url')
      .should('contain', 'academy_class_id=7')
      .and('contain', 'held_on=2026-10-19');
    cy.get('[data-cy="lesson-expand-2"]').should('have.attr', 'aria-expanded', 'true');

    cy.intercept('PUT', '/api/v1/lessons/topics', {
      statusCode: 200,
      body: {
        data: {
          id: 90,
          academy_class_id: 7,
          held_on: '2026-10-19',
          name: 'Fundamentals',
          starts_at: '19:00',
          kind: 'gi',
          notes: null,
          held: false,
          topics: [],
        },
      },
    }).as('save');
    cy.get('[data-cy="lesson-topic-21"]').click();
    cy.get('[data-cy="lesson-sheet-save"]').click();

    cy.wait('@save')
      .its('request.body')
      .should('deep.include', {
        academy_class_id: 7,
        held_on: '2026-10-19',
        topic_ids: [21],
      });
    // The weeks are read again, so the new plan shows on the map.
    cy.wait('@calendar');
  });

  it('asks the map for the same filter as the report', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@calendar');

    cy.get('[data-cy="syllabus-coverage-kind"]').contains('No-gi').click();

    cy.wait('@calendar').its('request.url').should('contain', 'kind=nogi');
  });

  it('keeps the names and fractions when the weeks cannot be loaded', () => {
    stub();
    cy.intercept('GET', '/api/v1/stats/syllabus/calendar*', { statusCode: 500, body: {} }).as(
      'broken',
    );

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@broken');

    cy.get('[data-cy="season-map-error"]').should('be.visible');
    cy.get('[data-cy="syllabus-position-1"]').should('contain.text', '3/6');

    // The retry is a full-size button, the one action in this state.
    cy.get('[data-cy="season-map-retry"] button').invoke('outerHeight').should('be.gte', 48);
  });

  it('re-asks the server when the gi filter moves — the denominator moves with it', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: report({
          kind: 'nogi',
          totals: { in_scope: 3, covered: 1, thin: 0, missing: 2, percentage: 33 },
        }),
      },
    }).as('filtered');

    cy.get('[data-cy="syllabus-coverage-kind"]').contains('No-gi').click();

    cy.wait('@filtered').its('request.url').should('contain', 'kind=nogi');
    cy.get('[data-cy="syllabus-coverage"]').should(
      'contain.text',
      "1 of 3 in the season's programme, each taught at least twice",
    );
  });

  it('filters a judo academy by its own modes (#1803)', () => {
    stub(report(), { ...ACADEMY, martial_art: 'judo', training_modes: ['tachi-waza', 'ne-waza'] });

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-coverage-kind"]')
      .should('contain.text', 'Tachi-waza')
      .and('not.contain.text', 'Gi');
    cy.get('[data-cy="syllabus-coverage-kind"]').contains('Ne-waza').click();

    cy.wait('@coverage').its('request.url').should('contain', 'kind=ne-waza');
  });

  it('walks back a season, and offers nothing past the current one', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-coverage-next"]').should('be.disabled');

    cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
      statusCode: 200,
      body: {
        data: report({ season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' } }),
      },
    }).as('previous');

    cy.get('[data-cy="syllabus-coverage-prev"]').click();

    cy.wait('@previous').its('request.url').should('contain', 'seasons_back=1');
    cy.get('[data-cy="syllabus-coverage-season"]').should('contain.text', '2025/26');
    cy.get('[data-cy="syllabus-coverage-next"]').should('not.be.disabled');
  });

  it('tells an academy with no programme what to do, rather than showing it a 0%', () => {
    stub(
      report({
        totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
        positions: [],
        missing: [],
        taught: [],
      }),
    );

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-coverage-no-programme"]').should('be.visible');
    cy.get('[data-cy="syllabus-coverage-positions"]').should('not.exist');

    // The same filled button every other empty state has (STSY-2).
    cy.get('[data-cy="syllabus-coverage-no-programme-cta"]').click();
    cy.location('pathname').should('eq', '/dashboard/academy/syllabus');
  });

  it('reaches the report from the stats tabs', () => {
    stub();

    cy.visitAuthenticated('/dashboard/stats');
    cy.get('[data-cy="stats-tab-syllabus"]', { timeout: 15000 }).click();

    cy.location('pathname').should('eq', '/dashboard/stats/syllabus');
    cy.get('[data-cy="syllabus-coverage"]').should('exist');
  });
});

describe('Who has seen a technique (#1745)', () => {
  function person(id: number, first: string, last: string, over: Record<string, unknown> = {}) {
    return {
      id,
      first_name: first,
      last_name: last,
      belt: 'blue',
      stripes: 1,
      status: 'active',
      joined_at: '2026-09-01',
      date_of_birth: null,
      photo_url: null,
      user_avatar_url: null,
      exposures: 0,
      last_seen_on: null,
      state: 'never',
      ...over,
    };
  }

  const EXPOSURE = {
    topic: { id: 11, name: 'Armbar', parent_name: 'Closed guard', kind: 'both', in_season: true },
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    lessons: [
      {
        id: 1,
        held_on: '2026-09-16',
        name: 'Fundamentals',
        kind: 'gi',
        starts_at: '19:00',
        headcount: 2,
      },
      {
        id: 2,
        held_on: '2026-10-05',
        name: 'Fundamentals',
        kind: 'gi',
        starts_at: '19:00',
        headcount: 1,
      },
    ],
    athletes: [
      person(1, 'Anna', 'Bianchi', { exposures: 2, last_seen_on: '2026-10-05', state: 'seen' }),
      person(2, 'Marco', 'Rossi', { exposures: 1, last_seen_on: '2026-09-16', state: 'thin' }),
      person(3, 'Giulia', 'Verdi'),
    ],
    totals: { lessons: 2, seen: 1, thin: 1, never: 1, unplaced: 0 },
  };

  it('opens a taught row on its lessons and on who was, and was not, there', () => {
    stub();
    cy.intercept('GET', '/api/v1/stats/syllabus/topics/11*', {
      statusCode: 200,
      body: { data: EXPOSURE },
    }).as('exposure');

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-taught-11"] button').click();
    cy.wait('@exposure').its('request.url').should('contain', 'seasons_back=0');

    cy.get('[data-cy="exposure-head"]').should('contain.text', 'Armbar');
    cy.get('[data-cy="exposure-lessons"]')
      .should('contain.text', 'Taught in 2 lessons this season')
      .and('contain.text', '2 people');
    cy.get('[data-cy="exposure-group-seen"]').should('contain.text', 'Anna Bianchi');
    cy.get('[data-cy="exposure-group-thin"]').should('contain.text', 'Marco Rossi');
    cy.get('[data-cy="exposure-group-never"]').should('contain.text', 'Giulia Verdi');
  });

  it('lists apart the people the record cannot place, never under never', () => {
    stub();
    cy.intercept('GET', '/api/v1/stats/syllabus/topics/11*', {
      statusCode: 200,
      body: {
        data: {
          ...EXPOSURE,
          athletes: [...EXPOSURE.athletes, person(4, 'Paolo', 'Neri', { state: 'unplaced' })],
          totals: { ...EXPOSURE.totals, unplaced: 1 },
        },
      },
    }).as('exposure');

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-taught-11"] button').click();
    cy.wait('@exposure');

    cy.get('[data-cy="exposure-group-unplaced"]').should('contain.text', 'Paolo Neri');
    cy.get('[data-cy="exposure-group-never"]').should('not.contain.text', 'Paolo Neri');
  });
});

describe('Plan what was never taught (#1656)', () => {
  it('opens the next class that may teach it, with it ticked, and carries it a week on', () => {
    stub(
      report({
        missing: [{ id: 21, name: 'Knee shield', parent_name: 'Half guard', kind: 'gi' }],
      }),
    );
    cy.clock(WEDNESDAY_NOON, ['Date']);
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: CLASSES },
    });
    cy.intercept('GET', '/api/v1/academy/syllabus', {
      statusCode: 200,
      body: { data: HALF_GUARD_PROGRAMME },
    });
    cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } }).as(
      'lesson',
    );

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    // A gi technique: tonight's no-gi class is passed over for Monday's gi one.
    cy.get('[data-cy="syllabus-missing-21"] button').should('contain.text', 'Plan').click();
    cy.wait('@lesson')
      .its('request.url')
      .should('contain', 'academy_class_id=7')
      .and('contain', 'held_on=2026-10-19');
    cy.get('[data-cy="lesson-expand-2"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-cy="lesson-topic-21"]').should('have.attr', 'aria-pressed', 'true');

    // The technique is what the owner came for, not an edit: the week still moves.
    cy.get('[data-cy="lesson-sheet-step-hint"]').should('not.exist');
    cy.get('[data-cy="lesson-sheet-next"]').should('not.be.disabled').click();
    cy.wait('@lesson').its('request.url').should('contain', 'held_on=2026-10-26');
    cy.get('[data-cy="lesson-topic-21"]').should('have.attr', 'aria-pressed', 'true');

    cy.intercept('PUT', '/api/v1/lessons/topics', {
      statusCode: 200,
      body: {
        data: {
          id: 91,
          academy_class_id: 7,
          held_on: '2026-10-26',
          name: 'Fundamentals',
          starts_at: '19:00',
          kind: 'gi',
          notes: null,
          held: false,
          topics: [],
        },
      },
    }).as('save');
    cy.get('[data-cy="lesson-sheet-save"]').click();

    cy.wait('@save')
      .its('request.body')
      .should('deep.include', {
        academy_class_id: 7,
        held_on: '2026-10-26',
        topic_ids: [21],
      });
    // The plan shows on the season map: its weeks are read again.
    cy.wait('@calendar');
  });

  it('leaves a row no class may teach a plain row', () => {
    stub(
      report({
        missing: [{ id: 32, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' }],
      }),
    );
    cy.clock(WEDNESDAY_NOON, ['Date']);
    cy.intercept('GET', '/api/v1/academy/classes', {
      statusCode: 200,
      body: { data: [CLASSES[0]] },
    });

    cy.visitAuthenticated('/dashboard/stats/syllabus');
    cy.wait('@coverage');

    cy.get('[data-cy="syllabus-missing-32"]').should('contain.text', 'Lockdown');
    cy.get('[data-cy="syllabus-missing-32"] button').should('not.exist');
  });
});
