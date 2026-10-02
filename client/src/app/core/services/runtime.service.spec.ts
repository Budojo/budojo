import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RuntimeService, WEB_CAPABILITIES } from './runtime.service';

/**
 * Runtime capability list (#1229). The default is "everything" so the hosted
 * web app — and every existing E2E spec that never mocks the endpoint —
 * behaves exactly as before; only a successful response narrows the set.
 */
describe('RuntimeService', () => {
  let service: RuntimeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RuntimeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('assumes every web capability before anything is loaded, and not the device sync', () => {
    expect(service.capabilities()).toEqual(WEB_CAPABILITIES);
    expect(service.has()('community')).toBe(true);
    expect(service.has()('sync')).toBe(false);
    expect(service.profile()).toBe('web');
  });

  // A surface that only some runtimes lack (the phone's document upload,
  // #2034) must not paint on the optimistic default and then vanish.
  it('confirms a capability only once the server has answered', async () => {
    expect(service.hasConfirmed()('document_upload')).toBe(false);

    const loading = service.load();
    http
      .expectOne('/api/v1/runtime')
      .flush({ data: { profile: 'desktop', capabilities: ['document_upload', 'sync'] } });
    await loading;

    expect(service.hasConfirmed()('document_upload')).toBe(true);
    expect(service.hasConfirmed()('community')).toBe(false);
  });

  // The default it keeps holds the upload: on the phone that would be a
  // button whose submit gets a 404.
  it('confirms nothing when the request fails, or answers with no runtime', async () => {
    const failing = service.load();
    http
      .expectOne('/api/v1/runtime')
      .flush({ message: 'down' }, { status: 500, statusText: 'Server Error' });
    await failing;
    expect(service.loaded()).toBe(true);
    expect(service.hasConfirmed()('document_upload')).toBe(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(RuntimeService);
    const freshHttp = TestBed.inject(HttpTestingController);
    const malformed = fresh.load();
    freshHttp.expectOne('/api/v1/runtime').flush('<!doctype html>');
    await malformed;
    expect(fresh.hasConfirmed()('document_upload')).toBe(false);
    freshHttp.verify();
  });

  it('keeps the sync only when a device reports it', async () => {
    const loading = service.load();
    http
      .expectOne('/api/v1/runtime')
      .flush({ data: { profile: 'desktop', capabilities: ['sync'] } });
    await loading;

    expect(service.has()('sync')).toBe(true);
  });

  it('narrows to what the API reports', async () => {
    const pending = service.load();
    http.expectOne('/api/v1/runtime').flush({ data: { profile: 'desktop', capabilities: [] } });
    await pending;

    expect(service.profile()).toBe('desktop');
    expect(service.capabilities()).toEqual([]);
    expect(service.has()('community')).toBe(false);
    expect(service.has()('athlete_accounts')).toBe(false);
  });

  it('keeps a partial list exactly as reported', async () => {
    const pending = service.load();
    http
      .expectOne('/api/v1/runtime')
      .flush({ data: { profile: 'web', capabilities: ['community'] } });
    await pending;

    expect(service.has()('community')).toBe(true);
    expect(service.has()('web_push')).toBe(false);
  });

  it('keeps the web default when the endpoint fails, and never rejects', async () => {
    // A blip must not hide surfaces on the web; the server 404s a truly
    // absent capability anyway, so the cost of a stale "all" is one dead click.
    const pending = service.load();
    http.expectOne('/api/v1/runtime').flush('nope', { status: 500, statusText: 'Server Error' });
    await expect(pending).resolves.toBeUndefined();

    expect(service.capabilities()).toEqual(WEB_CAPABILITIES);
  });

  it('keeps the web default when the response is not the runtime shape', async () => {
    // A catch-all Cypress stub answering { data: [] }, a proxy returning the
    // SPA shell, a half-deployed API: none of these may empty the set. This
    // is exactly how athlete-invite.cy.ts lost its invitation card in CI.
    const pending = service.load();
    http.expectOne('/api/v1/runtime').flush({ data: [] });
    await pending;

    expect(service.capabilities()).toEqual(WEB_CAPABILITIES);
    expect(service.profile()).toBe('web');
  });

  it('drops unknown capability names instead of carrying them', async () => {
    const pending = service.load();
    http
      .expectOne('/api/v1/runtime')
      .flush({ data: { profile: 'web', capabilities: ['community', 'teleport'] } });
    await pending;

    expect(service.capabilities()).toEqual(['community']);
  });

  it('fetches once and shares the promise across callers', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne('/api/v1/runtime').flush({ data: { profile: 'web', capabilities: [] } });
    await Promise.all([first, second]);

    expect(first).toBe(second);
    http.expectNone('/api/v1/runtime');
  });

  it('says when the answer is in, whichever way it went (#1627)', async () => {
    // A gate that hides web-only chrome needs to tell "desktop" from "not
    // asked yet" — the default is the web one.
    expect(service.loaded()).toBe(false);

    const pending = service.load();
    http.expectOne('/api/v1/runtime').flush({ data: { profile: 'desktop', capabilities: [] } });
    await pending;

    expect(service.loaded()).toBe(true);
  });

  it('says so even when the request fails', async () => {
    const pending = service.load();
    http
      .expectOne('/api/v1/runtime')
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    await pending;

    expect(service.loaded()).toBe(true);
    // …and the web default is kept, so a blip hides nothing.
    expect(service.profile()).toBe('web');
  });
});
