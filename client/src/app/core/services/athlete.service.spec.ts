import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Athlete, AthletePayload, AthleteService, AthleteUpdatePayload } from './athlete.service';

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: 'mario@example.com',
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: '1990-05-15',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    joined_at: '2023-01-10',
    created_at: '2026-04-22T10:00:00+00:00',
    ...overrides,
  };
}

describe('AthleteService', () => {
  let service: AthleteService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AthleteService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AthleteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('GETs /api/v1/athletes with no params by default', () => {
      service.list().subscribe();
      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } });
    });

    it('serializes belt, status, and page filters as query params', () => {
      service.list({ belt: 'blue', status: 'active', page: 2 }).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('belt') === 'blue' &&
          r.params.get('status') === 'active' &&
          r.params.get('page') === '2',
      );
      req.flush({ data: [], meta: { current_page: 2, last_page: 2, total: 0, per_page: 20 } });
    });
  });

  describe('get', () => {
    it('GETs /api/v1/athletes/:id and unwraps the data envelope', () => {
      const athlete = makeAthlete({ id: 42 });
      let result: Athlete | null = null;
      service.get(42).subscribe((a) => (result = a));

      const req = httpMock.expectOne('/api/v1/athletes/42');
      expect(req.request.method).toBe('GET');
      req.flush({ data: athlete });

      expect(result).toEqual(athlete);
    });
  });

  describe('create', () => {
    it('POSTs payload to /api/v1/athletes and returns the created athlete', () => {
      const payload: AthletePayload = {
        first_name: 'Mario',
        last_name: 'Rossi',
        email: null,
        phone_country_code: null,
        phone_national_number: null,
        date_of_birth: null,
        belt: 'white',
        stripes: 0,
        status: 'active',
        joined_at: '2026-04-23',
      };
      const created = makeAthlete({ id: 99, first_name: 'Mario', last_name: 'Rossi' });
      let result: Athlete | null = null;
      service.create(payload).subscribe((a) => (result = a));

      const req = httpMock.expectOne('/api/v1/athletes');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ data: created });

      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('PUTs partial payload to /api/v1/athletes/:id and returns the updated athlete', () => {
      const payload: AthleteUpdatePayload = { belt: 'purple', stripes: 0 };
      const updated = makeAthlete({ id: 7, belt: 'purple', stripes: 0 });
      let result: Athlete | null = null;
      service.update(7, payload).subscribe((a) => (result = a));

      const req = httpMock.expectOne('/api/v1/athletes/7');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(payload);
      req.flush({ data: updated });

      expect(result).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('DELETEs /api/v1/athletes/:id', () => {
      service.delete(5).subscribe();
      const req = httpMock.expectOne('/api/v1/athletes/5');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
