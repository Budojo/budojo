import { MOCK_ACADEMY } from '../support/fixtures';

// Responsive E2E coverage for the phone country-code dropdown (#238).
//
// History: PR #231 added `[showClear]="true"` to the p-select per Luigi's
// feedback (#228). On a Pixel 8 Pro-class viewport (412 × 915) the select
// trigger then ellipsed the prefix to "+..." because the X + chevron eat
// ~64px of the 7rem (112px) trigger. Width was bumped to 9rem in #238;
// THIS spec pins that decision so the next time someone touches the
// p-select trigger CSS we catch the regression in CI, not in production.

// Academy mock with the phone pair POPULATED — the bug is about the
// SELECTED value being ellipsed; an academy without a phone would
// render the "Code" placeholder, which is not what we're testing.
const ACADEMY_WITH_PHONE_OK = {
  statusCode: 200,
  body: {
    data: {
      ...MOCK_ACADEMY,
      phone_country_code: '+39',
      phone_national_number: '3331234567',
    },
  },
};

const ATHLETE_WITH_PHONE = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  address: null,
  date_of_birth: '1990-05-15',
  belt: 'blue' as const,
  stripes: 2,
  status: 'active' as const,
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
};

const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

// 412 × 915 is the Pixel 8 Pro CSS viewport — the device the bug was
// reported on. iPhone SE (375 × 667) is the second-tightest mainstream
// width we still want to honour; both should render the prefix in full.
const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: 'Pixel 8 Pro', width: 412, height: 915 },
  { name: 'iPhone SE', width: 375, height: 667 },
];

VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`Phone country-code prefix renders fully (${name}, ${width}×${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      cy.intercept('GET', '/api/v1/academy', ACADEMY_WITH_PHONE_OK).as('academy');
      cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
      cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    });

    it('shows the full "+39" on the academy edit form (no ellipsis)', () => {
      cy.visitAuthenticated('/dashboard/academy/edit');
      cy.wait('@academy');

      // The PrimeNG p-select renders the selected value via our
      // `<ng-template pTemplate="selectedItem">` — the rendered text in
      // the trigger MUST match `+\d+` start-to-end. An ellipsed value
      // would read "+..." and fail this assertion.
      cy.get('[data-cy="academy-form-phone-country-code"]')
        .find('.p-select-label')
        .invoke('text')
        .then((t) => t.trim())
        .should('match', /^\+\d+$/);
    });

    it('shows the full "+39" on the athlete edit form (no ellipsis)', () => {
      cy.intercept('GET', '/api/v1/athletes/42', {
        statusCode: 200,
        body: { data: ATHLETE_WITH_PHONE },
      }).as('athlete');

      cy.visitAuthenticated('/dashboard/athletes/42/edit');
      cy.wait(['@academy', '@athlete']);

      cy.get('#phone_country_code')
        .closest('.p-select')
        .find('.p-select-label')
        .invoke('text')
        .then((t) => t.trim())
        .should('match', /^\+\d+$/);
    });

    it('keeps the chevron + clear icon BOTH visible on the trigger', () => {
      cy.intercept('GET', '/api/v1/athletes/42', {
        statusCode: 200,
        body: { data: ATHLETE_WITH_PHONE },
      }).as('athlete');

      cy.visitAuthenticated('/dashboard/athletes/42/edit');
      cy.wait(['@academy', '@athlete']);

      // PrimeNG paints the chevron with `.p-select-dropdown-icon` and
      // the clear button with `.p-select-clear-icon` — we want both
      // visible inside the same trigger, alongside the value.
      const trigger = () => cy.get('#phone_country_code').closest('.p-select');
      trigger().find('.p-select-dropdown-icon').should('be.visible');
      trigger().find('.p-select-clear-icon').should('be.visible');
    });
  });
});
