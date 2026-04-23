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

    it('clears the signal on 404 / 401 so the guard can redirect', () => {
      service.get().subscribe({ error: () => void 0 });
      httpMock
        .expectOne('/api/v1/academy')
        .flush('not found', { status: 404, statusText: 'Not Found' });

      expect(service.academy()).toBeNull();
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
});
