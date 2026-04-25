import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Academy, AcademyService } from './academy.service';

function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: 1,
    name: 'Gracie Barra Torino',
    slug: 'gracie-barra-torino',
    address: null,
    logo_url: null,
    ...overrides,
  };
}

describe('AcademyService', () => {
  let service: AcademyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AcademyService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AcademyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get — caching', () => {
    it('GETs /api/v1/academy on first call and populates the signal', () => {
      const academy = makeAcademy();
      let received: Academy | undefined;

      service.get().subscribe((a) => (received = a));
      httpMock.expectOne('/api/v1/academy').flush({ data: academy });

      expect(received).toEqual(academy);
      expect(service.academy()).toEqual(academy);
    });

    it('short-circuits subsequent calls — zero HTTP traffic when cached', () => {
      const academy = makeAcademy();
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: academy });

      // Simulate 3 route navigations — hasAcademyGuard fires each time.
      let secondHit: Academy | undefined;
      service.get().subscribe((a) => (secondHit = a));
      service.get().subscribe();
      service.get().subscribe();

      // If the cache were missing, expectNone() would throw.
      httpMock.expectNone('/api/v1/academy');
      expect(secondHit).toEqual(academy);
    });

    it('deduplicates concurrent in-flight callers — single HTTP request', () => {
      // Two guards firing in the same tick (noAcademyGuard redirect → hasAcademyGuard).
      const firstResults: Academy[] = [];
      const secondResults: Academy[] = [];
      service.get().subscribe((a) => firstResults.push(a));
      service.get().subscribe((a) => secondResults.push(a));

      const req = httpMock.expectOne('/api/v1/academy');
      req.flush({ data: makeAcademy() });

      expect(firstResults).toHaveLength(1);
      expect(secondResults).toHaveLength(1);
      httpMock.expectNone('/api/v1/academy');
    });

    it('bypasses the cache when forceRefresh is true', () => {
      const initial = makeAcademy({ name: 'Original' });
      const updated = makeAcademy({ name: 'Renamed' });

      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: initial });
      expect(service.academy()?.name).toBe('Original');

      let refreshed: Academy | undefined;
      service.get({ forceRefresh: true }).subscribe((a) => (refreshed = a));
      httpMock.expectOne('/api/v1/academy').flush({ data: updated });

      expect(refreshed).toEqual(updated);
      expect(service.academy()?.name).toBe('Renamed');
    });

    it('clear() invalidates the cache so the next get() re-fetches', () => {
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: makeAcademy() });

      service.clear();
      expect(service.academy()).toBeNull();

      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: makeAcademy() });
    });

    it('clear() during an in-flight get() prevents the late response from repopulating the signal', () => {
      // Logout correctness: user clicks logout while /api/v1/academy is pending.
      // The late tap() must not write stale session data back into the signal.
      service.get().subscribe({ next: () => void 0, error: () => void 0 });
      const req = httpMock.expectOne('/api/v1/academy');

      service.clear();
      expect(service.academy()).toBeNull();

      req.flush({ data: makeAcademy({ name: 'Stale session academy' }) });

      expect(service.academy()).toBeNull();
    });

    it('forceRefresh starting mid-flight does not let the old response clobber the new one', () => {
      // Start an initial in-flight request.
      service.get().subscribe({ next: () => void 0, error: () => void 0 });
      const firstReq = httpMock.expectOne('/api/v1/academy');

      // Force a new request before the first one resolves.
      let latest: Academy | undefined;
      service.get({ forceRefresh: true }).subscribe((a) => (latest = a));
      const secondReq = httpMock.expectOne('/api/v1/academy');

      // Flush the OLD one last — it must NOT overwrite the signal.
      secondReq.flush({ data: makeAcademy({ name: 'Fresh' }) });
      firstReq.flush({ data: makeAcademy({ name: 'Stale' }) });

      expect(latest?.name).toBe('Fresh');
      expect(service.academy()?.name).toBe('Fresh');
    });

    it('does not poison the cache on a failed fetch — next call retries', () => {
      let capturedError: HttpErrorResponse | undefined;
      service.get().subscribe({ error: (e) => (capturedError = e) });
      httpMock.expectOne('/api/v1/academy').flush('boom', { status: 500, statusText: 'ISE' });

      expect(capturedError?.status).toBe(500);
      expect(service.academy()).toBeNull();

      // Next call must retry, not serve a stale error.
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: makeAcademy() });
    });

    [
      { status: 404, statusText: 'Not Found' },
      { status: 401, statusText: 'Unauthorized' },
    ].forEach(({ status, statusText }) => {
      it(`clears the signal on ${status} so the guard can redirect`, () => {
        service.get().subscribe({ error: () => void 0 });
        httpMock.expectOne('/api/v1/academy').flush('request failed', { status, statusText });

        expect(service.academy()).toBeNull();
      });
    });
  });

  describe('create', () => {
    it('POSTs /api/v1/academy and updates the signal', () => {
      const created = makeAcademy({ id: 7, name: 'New GB' });
      let received: Academy | undefined;

      service.create({ name: 'New GB' }).subscribe((a) => (received = a));
      const req = httpMock.expectOne('/api/v1/academy');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'New GB' });
      req.flush({ data: created });

      expect(received).toEqual(created);
      expect(service.academy()).toEqual(created);
    });
  });

  describe('update', () => {
    it('PATCHes /api/v1/academy with a partial payload and swaps the signal', () => {
      // Hydrate the cache so we can verify the signal actually swaps — not
      // just gets populated.
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: makeAcademy({ name: 'Old' }) });
      expect(service.academy()?.name).toBe('Old');

      const updated = makeAcademy({ name: 'Renamed', address: 'Via Nuova 1' });
      let received: Academy | undefined;

      service.update({ name: 'Renamed', address: 'Via Nuova 1' }).subscribe((a) => (received = a));
      const req = httpMock.expectOne('/api/v1/academy');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Renamed', address: 'Via Nuova 1' });
      req.flush({ data: updated });

      expect(received).toEqual(updated);
      expect(service.academy()).toEqual(updated);
    });

    it('sends address: null on the wire when the caller explicitly clears it', () => {
      // Distinct from "address omitted" — the server contract is that `null`
      // clears, an omitted key leaves the previous value untouched. The
      // service must forward the caller's intent verbatim.
      service.update({ address: null }).subscribe();

      const req = httpMock.expectOne('/api/v1/academy');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ address: null });
      req.flush({ data: makeAcademy({ address: null }) });
    });

    it('propagates 422 server errors without clobbering the cached signal', () => {
      const cached = makeAcademy({ name: 'Unchanged' });
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: cached });

      let capturedError: HttpErrorResponse | undefined;
      service.update({ name: '' }).subscribe({ error: (e) => (capturedError = e) });
      httpMock.expectOne('/api/v1/academy').flush(
        { message: 'Invalid', errors: { name: ['required'] } },
        {
          status: 422,
          statusText: 'Unprocessable',
        },
      );

      expect(capturedError?.status).toBe(422);
      // Signal survives a validation failure — the form can retry without
      // a refetch and the sidebar brand label stays on-screen.
      expect(service.academy()).toEqual(cached);
    });

    it('clears the cache on 403 so downstream guards can redirect to /setup', () => {
      // Backend contract asymmetry: PATCH returns 403 when the user no
      // longer has an academy, while GET returns 404 for the same state.
      // The service turns 403 into the same net effect as a 404 from GET —
      // cache cleared — so the next guard run re-fetches, sees 404, and
      // redirects to /setup. Without this the sidebar would keep showing
      // a now-vanished academy until manual reload.
      const cached = makeAcademy({ name: 'About to vanish' });
      service.get().subscribe();
      httpMock.expectOne('/api/v1/academy').flush({ data: cached });
      expect(service.academy()).toEqual(cached);

      let capturedError: HttpErrorResponse | undefined;
      service.update({ name: 'Renamed' }).subscribe({ error: (e) => (capturedError = e) });
      httpMock
        .expectOne('/api/v1/academy')
        .flush({ message: 'Forbidden.' }, { status: 403, statusText: 'Forbidden' });

      expect(capturedError?.status).toBe(403);
      expect(service.academy()).toBeNull();
    });

    it('bumps the epoch so a mid-flight get() cannot clobber a successful update', () => {
      // Race: a forceRefresh get() started BEFORE the update must not
      // overwrite the fresh PATCH response when its (pre-update) response
      // eventually lands. Both write to the same signal; epoch protection
      // is the gate.
      service.get({ forceRefresh: true }).subscribe({ next: () => void 0, error: () => void 0 });
      const staleGet = httpMock.expectOne('/api/v1/academy');

      // Update kicks off — its entry bumps the epoch.
      service.update({ name: 'Renamed' }).subscribe();
      const patchReq = httpMock.expectOne('/api/v1/academy');

      patchReq.flush({ data: makeAcademy({ name: 'Renamed' }) });
      // Stale get() lands AFTER the PATCH with pre-update data.
      staleGet.flush({ data: makeAcademy({ name: 'Old' }) });

      // The PATCH response wins — the stale get()'s tap() was gated off
      // by the bumped epoch.
      expect(service.academy()?.name).toBe('Renamed');
    });
  });
});
