import { MOCK_ACADEMY } from '../support/fixtures';

/**
 * Importing a roster from a CSV (#1346).
 *
 * The flow's whole point is that **nothing is written until the owner has
 * seen what would be written**, so what this spec follows is that sequence:
 * pick a file, read the parsed result, then confirm. The assertion that
 * matters most is the negative one — the first request the screen makes is a
 * dry run, and a regression that flipped it would create a roster from a file
 * someone was only looking at.
 */
const IMPORT_URL = '/api/v1/athletes/import';

/** What the server answers for the sample file below. */
const preview = {
  dry_run: true,
  delimiter: ';',
  columns: ['Nome', 'Cognome', 'Cintura', 'Data di nascita'],
  mapping: {
    first_name: 'Nome',
    last_name: 'Cognome',
    belt: 'Cintura',
    date_of_birth: 'Data di nascita',
  },
  fields: ['first_name', 'last_name', 'belt', 'stripes', 'status', 'joined_at', 'date_of_birth'],
  imported: 2,
  skipped: 1,
  rows: [
    {
      row: 2,
      status: 'ok',
      values: {
        first_name: 'Marco',
        last_name: 'Rossi',
        belt: 'blue',
        date_of_birth: '1990-03-15',
        joined_at: '2024-09-01',
      },
      errors: {},
    },
    {
      row: 3,
      status: 'ok',
      values: {
        first_name: 'Luca',
        last_name: 'Bianchi',
        belt: 'white',
        date_of_birth: '',
        joined_at: '2024-09-01',
      },
      errors: {},
    },
    {
      row: 4,
      status: 'invalid',
      values: { first_name: 'Anna', last_name: 'Verdi', belt: '', joined_at: '2024-09-01' },
      errors: { belt: ['The selected belt is invalid.'] },
    },
  ],
};

describe('Athlete CSV import (#1346)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });
    cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: MOCK_ACADEMY } });
    // The roster needs its pagination envelope, not the catch-all's bare
    // `{data: []}` — the list reads `meta.total` and throws on undefined,
    // which shows up as a failure in whichever test navigated there.
    cy.intercept('GET', '/api/v1/athletes?*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } },
    });
    cy.intercept('POST', IMPORT_URL, (req) => {
      const dryRun = /name="validate_only"\r?\n\r?\n1/.test(req.body as string);
      req.reply({
        statusCode: 200,
        body: { data: { ...preview, dry_run: dryRun, imported: dryRun ? 2 : 2 } },
      });
    }).as('import');
  });

  /** The awkward file, because it is the one an Italian academy has. */
  const sample = {
    contents: Cypress.Buffer.from(
      'Nome;Cognome;Cintura;Data di nascita\n' +
        'Marco;Rossi;blu;15/03/1990\n' +
        'Luca;Bianchi;bianca;\n' +
        'Anna;Verdi;fucsia;\n',
    ),
    fileName: 'atleti.csv',
    mimeType: 'text/csv',
  };

  it('previews the file before writing anything, then imports on confirm', () => {
    cy.visitAuthenticated('/dashboard/athletes/import');

    cy.get('[data-cy="import-pick"]').should('be.visible');
    cy.get('[data-cy="import-preview"]').should('not.exist');

    cy.get('[data-cy="import-file"]').selectFile(sample, { force: true });

    // The first request must be a dry run. This is the safety property the
    // whole two-step design exists for.
    cy.wait('@import').its('request.body').should('contain', 'name="validate_only"');
    cy.get('[data-cy="import-summary"]').should('be.visible');

    // The mapping is shown even though every guess was right — a guess nobody
    // saw is one nobody can correct.
    cy.get('[data-cy="import-mapping"]').should('be.visible');
    cy.get('[data-cy="import-filename"]').should('contain', 'atleti.csv');

    // The parsed values, not the raw cells: `blu` read as a blue belt and
    // `15/03/1990` as a date. That is what the owner is checking — and it is
    // shown in THEIR words, not the wire's, or there is nothing to check
    // against. Asserted locale-independently: the year is there and the ISO
    // string is not, which holds whichever language the run is in.
    cy.get('[data-cy="import-preview"]').should('contain', 'Marco Rossi');
    cy.get('[data-cy="import-preview"]').should('not.contain', '1990-03-15');
    cy.get('[data-cy="import-preview"]').should('contain', '1990');
    cy.get('[data-cy="import-preview"]').should('not.contain', 'blue');

    // And the row that will not import, with its reason beside it.
    cy.get('[data-cy="import-preview"]').should('contain', 'Anna Verdi');
    cy.get('[data-cy="import-preview"]').should('contain', 'belt is invalid');

    cy.get('[data-cy="import-confirm"]').click();
    cy.wait('@import');

    // Afterwards it offers the roster, not the button again — nobody should
    // import the same file twice by pressing what is still under the cursor.
    cy.get('[data-cy="import-confirm"]').should('not.exist');
    cy.get('[data-cy="import-see-roster"]').should('be.visible');
  });

  it('is reachable from the roster', () => {
    cy.visitAuthenticated('/dashboard/athletes');

    // An academy arriving with an existing roster has to be able to find this
    // on day one, which is why it sits in the header rather than an overflow.
    cy.get('[data-cy="import-athletes-btn"]').click();
    cy.location('pathname').should('eq', '/dashboard/athletes/import');
    cy.get('[data-cy="import-pick"]').should('be.visible');
  });

  it('turns an unmapped required column into a fixable step, not a dead end', () => {
    cy.intercept('POST', IMPORT_URL, {
      statusCode: 422,
      body: {
        message: 'Some required columns are not mapped.',
        missing: ['belt'],
        columns: ['Nome', 'Cognome', 'Peso'],
        mapping: { first_name: 'Nome', last_name: 'Cognome' },
      },
    }).as('refused');

    cy.visitAuthenticated('/dashboard/athletes/import');
    cy.get('[data-cy="import-file"]').selectFile(sample, { force: true });
    cy.wait('@refused');

    // The file is fine; one dropdown is empty. Sending the user back to Excel
    // would be the wrong answer to a problem fixable on this screen.
    cy.get('[data-cy="import-missing"]').should('be.visible');
    cy.get('[data-cy="import-mapping"]').should('be.visible');
    cy.get('[data-cy="import-preview"]').should('not.exist');
  });
});
