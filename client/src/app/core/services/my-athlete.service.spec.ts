import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MyAthleteService } from './my-athlete.service';

describe('MyAthleteService (#750)', () => {
  let svc: MyAthleteService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(MyAthleteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('state()', () => {
    it('GETs /me/athlete/state and remaps snake_case → camelCase', () => {
      let result: { enrolled: boolean; athleteId: number | null } | null = null;
      svc.state().subscribe((s) => (result = s));

      const req = http.expectOne('/api/v1/me/athlete/state');
      expect(req.request.method).toBe('GET');
      req.flush({ data: { enrolled: true, athlete_id: 42 } });

      expect(result).toEqual({ enrolled: true, athleteId: 42 });
    });

    it('returns enrolled:false + athleteId:null when the server reports no active academy', () => {
      let result: { enrolled: boolean; athleteId: number | null } | null = null;
      svc.state().subscribe((s) => (result = s));

      http
        .expectOne('/api/v1/me/athlete/state')
        .flush({ data: { enrolled: false, athlete_id: null } });

      expect(result).toEqual({ enrolled: false, athleteId: null });
    });
  });

  describe('enroll()', () => {
    it('POSTs to /me/athlete with empty body and projects { enrolled: true, athleteId: id }', () => {
      let result: { enrolled: boolean; athleteId: number | null } | null = null;
      svc.enroll().subscribe((s) => (result = s));

      const req = http.expectOne('/api/v1/me/athlete');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ data: { id: 99, is_self: true } });

      expect(result).toEqual({ enrolled: true, athleteId: 99 });
    });

    it('returns enrolled:true even on idempotent 200 re-call (same athlete id)', () => {
      // The server replies 200 (vs 201) when the user already had a
      // self-row and re-posts; the projection MUST stay the same.
      let result: { enrolled: boolean; athleteId: number | null } | null = null;
      svc.enroll().subscribe((s) => (result = s));
      http.expectOne('/api/v1/me/athlete').flush({ data: { id: 99, is_self: true } });
      expect(result).toEqual({ enrolled: true, athleteId: 99 });
    });
  });

  describe('leave()', () => {
    it('DELETEs /me/athlete and projects { enrolled: false, athleteId: null }', () => {
      let result: { enrolled: boolean; athleteId: number | null } | null = null;
      svc.leave().subscribe((s) => (result = s));

      const req = http.expectOne('/api/v1/me/athlete');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(result).toEqual({ enrolled: false, athleteId: null });
    });
  });

  describe('isAvailable()', () => {
    it('emits true under jsdom (where `window` exists)', () => {
      let result: boolean | null = null;
      svc.isAvailable().subscribe((v) => (result = v));
      expect(result).toBe(true);
    });
  });
});
