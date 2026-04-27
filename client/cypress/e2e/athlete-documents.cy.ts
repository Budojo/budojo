import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
};

const ATHLETE = {
  id: 42,
  first_name: 'Mario',
  last_name: 'Rossi',
  email: 'mario@example.com',
  phone_country_code: '+39',
  phone_national_number: '3331234567',
  date_of_birth: '1990-05-15',
  belt: 'blue' as const,
  stripes: 2,
  status: 'active' as const,
  joined_at: '2023-01-10',
  created_at: '2026-04-22T10:00:00+00:00',
};

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    issued_at: '2026-01-01',
    expires_at: '2027-01-01',
    notes: null,
    created_at: '2026-04-23T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

describe('Athlete documents page', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes/42', { statusCode: 200, body: { data: ATHLETE } }).as(
      'getAthlete',
    );
    // One test in this suite lands on /dashboard/athletes where the M3.4
    // widget fires; keep it from reaching the dev proxy.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
  });

  it('renders the athlete header and an empty documents table', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } },
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait('@academy');
    cy.wait('@getAthlete');
    cy.wait('@getDocs');

    cy.get('h1').should('contain', 'Mario Rossi');
    cy.contains('Documents').should('be.visible');
    cy.contains('No documents yet').should('be.visible');
    // Post-M3.3: the Add button is enabled when the athlete id is known.
    // p-button wraps an inner <button>; the disabled pseudo-class lives there,
    // not on the custom element.
    cy.get('[data-cy="add-document-btn"] button').should('not.be.disabled');
  });

  it('lists only active documents when the toggle is off', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', (req) => {
      if (req.query['trashed'] === '1') {
        req.reply({
          body: { data: [doc({ id: 1 }), doc({ id: 2, deleted_at: '2026-04-20T10:00:00+00:00' })] },
        });
      } else {
        req.reply({ body: { data: [doc({ id: 1 })] } });
      }
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait('@academy');
    cy.wait('@getAthlete');
    cy.wait('@getDocs');

    cy.get('[data-cy="documents-table"] tbody tr').should('have.length', 1);
    cy.contains('Cancelled on').should('not.exist');
  });

  it('reveals tombstone rows when the toggle is turned on', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', (req) => {
      const withCancelled = req.query['trashed'] === '1';
      const rows = withCancelled
        ? [
            doc({ id: 1 }),
            doc({ id: 2, deleted_at: '2026-04-20T10:00:00+00:00', original_name: 'old.pdf' }),
          ]
        : [doc({ id: 1 })];
      req.reply({ body: { data: rows } });
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait('@academy');
    cy.wait('@getAthlete');
    cy.wait('@getDocs');

    cy.get('[data-cy="documents-table"] tbody tr').should('have.length', 1);

    // Flip the toggle — PrimeNG p-toggleswitch renders an inner checkbox-like
    // input; clicking the wrapping label triggers it.
    cy.get('[data-cy="show-cancelled-toggle"]').click();
    cy.wait('@getDocs');

    cy.get('[data-cy="documents-table"] tbody tr').should('have.length', 2);
    cy.contains('Cancelled on 2026-04-20').should('be.visible');
    // Tombstone row has no action buttons (Norman constraint).
    cy.contains('td', 'old.pdf').parent().find('[data-cy="download-btn"]').should('not.exist');
    cy.contains('td', 'old.pdf').parent().find('[data-cy="delete-btn"]').should('not.exist');
  });

  it('persists the toggle choice to localStorage', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait('@academy');
    cy.wait('@getDocs');

    cy.get('[data-cy="show-cancelled-toggle"]').click();
    cy.wait('@getDocs');

    cy.window().its('localStorage').invoke('getItem', 'documents.showCancelled').should('eq', '1');

    // Flip it off again
    cy.get('[data-cy="show-cancelled-toggle"]').click();
    cy.wait('@getDocs');
    cy.window().its('localStorage').invoke('getItem', 'documents.showCancelled').should('be.null');
  });

  it('uploads a document via the dialog, closes on success, prepends the row + shows a toast', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    // The POST returns the server-authoritative Document. The client prepends
    // it optimistically without refetching.
    cy.intercept('POST', '/api/v1/athletes/42/documents', {
      statusCode: 201,
      body: {
        data: doc({
          id: 777,
          original_name: 'medical_2026.pdf',
          type: 'medical_certificate',
          issued_at: '2026-01-15',
          expires_at: '2027-01-15',
        }),
      },
    }).as('uploadDoc');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait(['@academy', '@getAthlete', '@getDocs']);

    cy.get('[data-cy="add-document-btn"] button').click();
    cy.get('[data-cy="upload-document-dialog"]').should('be.visible');

    // p-select opens an overlay; we target the item by its label text.
    cy.get('[data-cy="doc-type"]').click();
    cy.contains('li', 'Medical certificate').click();

    // Attach the file into p-fileUpload's hidden native input — `force: true`
    // because the input is visually hidden behind a styled "Choose file" label.
    cy.get('[data-cy="doc-file"] input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 stub'),
        fileName: 'medical_2026.pdf',
        mimeType: 'application/pdf',
      },
      { force: true },
    );

    cy.get('[data-cy="upload-submit"] button').click();

    cy.wait('@uploadDoc')
      .its('request.headers.content-type')
      .should('match', /multipart\/form-data; boundary=/);

    // The Angular `<p-dialog>` host element stays in the DOM — only the modal
    // overlay mask (`.p-dialog-mask`) mounts/unmounts. Targeting it gives a
    // reliable signal for "dialog is closed".
    cy.get('.p-dialog-mask').should('not.exist');
    cy.contains('[data-cy="documents-table"]', 'medical_2026.pdf').should('be.visible');
    cy.contains('Document uploaded').should('be.visible');
  });

  it('keeps the dialog open and surfaces a 422 error banner on server validation failure', () => {
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');
    cy.intercept('POST', '/api/v1/athletes/42/documents', {
      statusCode: 422,
      body: {
        message: 'The file field is required.',
        errors: { file: ['The file field is required.'] },
      },
    }).as('uploadDoc');

    cy.visitAuthenticated('/dashboard/athletes/42/documents');
    cy.wait(['@academy', '@getAthlete', '@getDocs']);

    cy.get('[data-cy="add-document-btn"] button').click();
    cy.get('[data-cy="doc-type"]').click();
    cy.contains('li', 'Other').click();
    cy.get('[data-cy="doc-file"] input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('stub'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
      },
      { force: true },
    );
    cy.get('[data-cy="upload-submit"] button').click();

    cy.wait('@uploadDoc');
    cy.get('[data-cy="upload-document-dialog"]').should('be.visible');
    cy.contains('The file field is required').should('be.visible');
  });

  it('navigates to the documents page from the athletes list folder icon', () => {
    cy.intercept('GET', '/api/v1/athletes*', {
      statusCode: 200,
      body: {
        data: [ATHLETE],
        meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 },
      },
    }).as('listAthletes');
    cy.intercept('GET', '/api/v1/athletes/42/documents*', {
      statusCode: 200,
      body: { data: [] },
    }).as('getDocs');

    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@listAthletes');

    cy.get('[data-cy="documents-btn"]').first().click();
    cy.url().should('include', '/dashboard/athletes/42/documents');
    cy.wait('@getAthlete');
    cy.wait('@getDocs');
    cy.get('h1').should('contain', 'Mario Rossi');
  });
});
