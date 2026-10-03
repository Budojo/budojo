import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buffer, fromUtf8, utf8 } from './bytes';
import { HttpSyncServer } from './http-sync-server';

/** The device's own server, for the database side of the sync (#2030, #2031). */
describe('HttpSyncServer', () => {
  const ULID = '01J9ZQ3K8M4N5P6Q7R8S9T0V1W';
  let server: HttpSyncServer;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    server = TestBed.inject(HttpSyncServer);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('exports the database as bytes, with the schema the server names', async () => {
    const exported = server.exportDatabase();
    const request = http.expectOne('/api/v1/sync/export');
    expect(request.request.responseType).toBe('arraybuffer');
    request.flush(buffer(utf8('SQLite format 3')).buffer, {
      headers: { 'X-Budojo-Schema': '2026_10_01_090000_create_journal_table' },
    });

    const { database, schema } = await exported;
    expect(fromUtf8(database)).toBe('SQLite format 3');
    expect(schema).toBe('2026_10_01_090000_create_journal_table');
  });

  it('refuses an export with no schema: a version must name it', async () => {
    const exported = server.exportDatabase();
    http.expectOne('/api/v1/sync/export').flush(buffer(utf8('SQLite format 3')).buffer);

    await expect(exported).rejects.toThrow('schema');
  });

  it('stages another device’s database as a File, the one binary body the phone sends intact', async () => {
    const staged = server.stage(utf8('SQLite format 3'));
    const request = http.expectOne('/api/v1/sync/stage');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeInstanceOf(File);
    expect(fromUtf8(new Uint8Array(await (request.request.body as File).arrayBuffer()))).toBe(
      'SQLite format 3',
    );
    request.flush(null, { status: 204, statusText: 'No Content' });

    await staged;
  });

  it('stages a rebase with the flag the server sets the kept journal aside on (#2031)', async () => {
    const staged = server.stage(utf8('SQLite format 3'), { rebase: true });
    const request = http.expectOne('/api/v1/sync/stage?rebase=1');
    expect(request.request.method).toBe('PUT');
    request.flush(null, { status: 204, statusText: 'No Content' });

    await staged;
  });

  it('reads the journal and the holds, and clears through an entry', async () => {
    const journal = server.journal();
    http.expectOne('/api/v1/sync/journal').flush({ data: [{ id: ULID }] });
    expect(await journal).toEqual([{ id: ULID }]);

    const holds = server.holds();
    http.expectOne('/api/v1/sync/holds').flush({ data: { pc4f2a: ULID } });
    expect(await holds).toEqual({ pc4f2a: ULID });

    const cleared = server.clearJournal(ULID);
    const request = http.expectOne(`/api/v1/sync/journal?through=${ULID}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await cleared;
  });

  it('says whether the database holds an academy: 404 is none, anything else fails', async () => {
    const holds = server.holdsAcademy();
    http.expectOne('/api/v1/academy').flush({ data: { id: 1 } });
    expect(await holds).toBe(true);

    const none = server.holdsAcademy();
    http.expectOne('/api/v1/academy').flush({}, { status: 404, statusText: 'Not Found' });
    expect(await none).toBe(false);

    const failed = server.holdsAcademy();
    http.expectOne('/api/v1/academy').flush({}, { status: 500, statusText: 'Server Error' });
    await expect(failed).rejects.toBeTruthy();
  });
});
