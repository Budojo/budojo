import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Athlete } from './athlete.service';
import { SearchService } from './search.service';

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

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SearchService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('searchAthletes', () => {
    it('GETs /api/v1/search with the trimmed q query and unwraps data', () => {
      const athlete = makeAthlete();
      let received: Athlete[] | null = null;

      service.searchAthletes('mario').subscribe((rows) => {
        received = rows;
      });

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/search' && r.params.get('q') === 'mario',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [athlete] });

      expect(received).toEqual([athlete]);
    });

    it('trims whitespace before issuing the request', () => {
      service.searchAthletes('  mario  ').subscribe();
      const req = httpMock.expectOne((r) => r.params.get('q') === 'mario');
      req.flush({ data: [] });
    });

    it('returns an empty array WITHOUT a network request when q is empty', () => {
      let received: Athlete[] | null = null;
      service.searchAthletes('').subscribe((rows) => {
        received = rows;
      });
      // No request should have been issued. httpMock.verify() in afterEach
      // would fail if an unmatched request had been recorded.
      expect(received).toEqual([]);
    });

    it('returns an empty array WITHOUT a network request when q is whitespace-only', () => {
      let received: Athlete[] | null = null;
      service.searchAthletes('   ').subscribe((rows) => {
        received = rows;
      });
      expect(received).toEqual([]);
    });
  });
});
