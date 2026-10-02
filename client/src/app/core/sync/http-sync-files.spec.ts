import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buffer, fromUtf8, utf8 } from './bytes';
import { HttpSyncFiles } from './http-sync-files';

/** The device's own server, for the files side of the sync (#2030). */
describe('HttpSyncFiles', () => {
  const SHA = 'a'.repeat(64);
  let files: HttpSyncFiles;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    files = TestBed.inject(HttpSyncFiles);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the contents the database names', async () => {
    const listing = files.list();
    http
      .expectOne('/api/v1/sync/files')
      .flush({ data: [{ sha256: SHA, size: 7, present: true, complete: true }] });

    expect(await listing).toEqual([{ sha256: SHA, size: 7, present: true, complete: true }]);
  });

  it('reads a content as bytes', async () => {
    const read = files.read(SHA);
    const request = http.expectOne(`/api/v1/sync/files/${SHA}`);
    expect(request.request.responseType).toBe('arraybuffer');
    request.flush(buffer(utf8('a photo')).buffer);

    expect(fromUtf8(await read)).toBe('a photo');
  });

  it('writes a content as raw bytes', async () => {
    const write = files.write(SHA, utf8('a photo'));
    const request = http.expectOne(`/api/v1/sync/files/${SHA}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
    // A File: the phone's native HTTP garbles any other binary body (`binaryBody`).
    expect(request.request.body).toBeInstanceOf(File);
    expect(fromUtf8(new Uint8Array(await (request.request.body as File).arrayBuffer()))).toBe(
      'a photo',
    );
    request.flush(null, { status: 204, statusText: 'No Content' });

    await write;
  });
});
