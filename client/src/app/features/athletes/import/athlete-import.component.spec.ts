import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { MessageService } from 'primeng/api';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import type { AthleteImportReport } from '../../../core/services/athlete.service';
import { AthleteImportComponent } from './athlete-import.component';

const URL = '/api/v1/athletes/import';

/**
 * The import screen (#1346).
 *
 * The behaviour worth pinning hardest is that **nothing writes until asked
 * twice**. Every path that reaches the server here is a dry run except the one
 * the confirm button takes, and a regression that flipped it would create
 * sixty athletes from a file someone was only looking at.
 */
function report(overrides: Partial<AthleteImportReport> = {}): AthleteImportReport {
  return {
    dry_run: true,
    delimiter: ';',
    columns: ['Nome', 'Cognome', 'Cintura'],
    mapping: { first_name: 'Nome', last_name: 'Cognome', belt: 'Cintura' },
    fields: ['first_name', 'last_name', 'belt'],
    imported: 2,
    skipped: 1,
    rows: [
      {
        row: 2,
        status: 'ok',
        values: { first_name: 'Marco', last_name: 'Rossi', belt: 'blue' },
        errors: {},
      },
      {
        row: 3,
        status: 'ok',
        values: { first_name: 'Luca', last_name: 'Bianchi', belt: 'white' },
        errors: {},
      },
      {
        row: 4,
        status: 'invalid',
        values: { first_name: 'Anna', last_name: '', belt: null },
        errors: { belt: ['The belt field is required.'] },
      },
    ],
    ...overrides,
  };
}

describe('AthleteImportComponent', () => {
  let fixture: ComponentFixture<AthleteImportComponent>;
  let http: HttpTestingController;

  const query = (selector: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** Choosing a file, the way the DOM delivers it. */
  function choose(name = 'atleti.csv', selector = '[data-cy="import-file"]'): void {
    const input = query(selector) as HTMLInputElement;
    const file = new File(['Nome;Cognome;Cintura\nMarco;Rossi;blu\n'], name, { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AthleteImportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
        ...provideI18nTesting(),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AthleteImportComponent);
    fixture.detectChanges();
  });

  it('shows only the file picker until there is a file', () => {
    expect(query('[data-cy="import-pick"]')).not.toBeNull();
    expect(query('[data-cy="import-mapping"]')).toBeNull();
    expect(query('[data-cy="import-preview"]')).toBeNull();
    http.verify();
  });

  it('previews without writing as soon as a file is chosen', () => {
    choose();

    const request = http.expectOne(URL);
    const body = request.request.body as FormData;

    // The whole safety property: the first call the screen ever makes says
    // "tell me what would happen", never "do it".
    expect(body.get('validate_only')).toBe('1');
    expect((body.get('file') as File).name).toBe('atleti.csv');

    request.flush({ data: report() });
    fixture.detectChanges();

    expect(query('[data-cy="import-preview"]')).not.toBeNull();
    expect(text()).toContain('2');
  });

  it('shows the mapping even when every guess was right', () => {
    choose();
    http.expectOne(URL).flush({ data: report() });
    fixture.detectChanges();

    // A guess nobody saw is a guess nobody can correct, and being wrong here
    // writes surnames into the first-name column of every record.
    expect(query('[data-cy="import-mapping"]')).not.toBeNull();
    expect(query('[data-cy="map-first_name"]')).not.toBeNull();
  });

  it('re-previews with the corrected mapping when a column is changed', () => {
    choose();
    http.expectOne(URL).flush({ data: report() });
    fixture.detectChanges();

    fixture.componentInstance['onMappingChange']('belt', 'Grado');

    const second = http.expectOne(URL);
    const body = second.request.body as FormData;

    expect(body.get('mapping[belt]')).toBe('Grado');
    // Still a dry run: correcting a column must not import anything.
    expect(body.get('validate_only')).toBe('1');
    second.flush({ data: report() });
  });

  it('writes only when the confirm button is pressed', () => {
    choose();
    http.expectOne(URL).flush({ data: report() });
    fixture.detectChanges();

    (query('[data-cy="import-confirm"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const second = http.expectOne(URL);
    expect((second.request.body as FormData).get('validate_only')).toBe('0');

    second.flush({ data: report({ dry_run: false, imported: 2 }) });
    fixture.detectChanges();

    // And then offers the roster rather than the button again, so nobody
    // imports the same file twice by pressing what is still under the cursor.
    expect(query('[data-cy="import-confirm"]')).toBeNull();
    expect(query('[data-cy="import-see-roster"]')).not.toBeNull();
  });

  it('cannot be confirmed when nothing would be imported', () => {
    choose();
    http
      .expectOne(URL)
      .flush({ data: report({ imported: 0, skipped: 1, rows: [report().rows[2]] }) });
    fixture.detectChanges();

    const button = query('[data-cy="import-confirm"] button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('turns an unmapped-column refusal into the mapping step, not an error', () => {
    choose();
    http.expectOne(URL).flush(
      {
        message: 'Some required columns are not mapped.',
        missing: ['belt'],
        columns: ['Nome', 'Cognome', 'Peso'],
        mapping: { first_name: 'Nome', last_name: 'Cognome' },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    // The file is fine and one dropdown is empty. Sending the user back to
    // Excel for that would be the wrong answer to a fixable problem.
    expect(query('[data-cy="import-missing"]')).not.toBeNull();
    expect(query('[data-cy="import-mapping"]')).not.toBeNull();
    expect(query('[data-cy="import-preview"]')).toBeNull();
    expect(query('[data-cy="import-filename"]')?.textContent).toContain('atleti.csv');
  });

  it('forgets the previous file entirely when another is chosen', () => {
    choose('primo.csv');
    http.expectOne(URL).flush(
      {
        message: 'Some required columns are not mapped.',
        missing: ['belt'],
        columns: [],
        mapping: {},
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();
    expect(query('[data-cy="import-missing"]')).not.toBeNull();

    // Through the inline control, because the big picker is gone once there
    // IS a file — which is exactly why that control has to exist.
    choose('secondo.csv', '[data-cy="import-file-swap"]');
    http.expectOne(URL).flush({ data: report() });
    fixture.detectChanges();

    // Without the reset, the new file's rows would render under the old
    // file's error.
    expect(query('[data-cy="import-missing"]')).toBeNull();
    expect(query('[data-cy="import-filename"]')?.textContent).toContain('secondo.csv');
  });
});
