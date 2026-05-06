import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AthleteInviteAcceptPayload,
  AthleteInviteAcceptResponse,
  AthleteInvitePreview,
  AthleteInviteService,
} from './athlete-invite.service';

describe('AthleteInviteService (M7 PR-C)', () => {
  let service: AthleteInviteService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AthleteInviteService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AthleteInviteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('preview', () => {
    it('GETs /api/v1/athlete-invite/:token/preview and unwraps data', () => {
      const fixture: AthleteInvitePreview = {
        first_name: 'Mario',
        last_name: 'Rossi',
        email: 'mario@example.com',
        academy_name: 'Apex Grappling',
        expires_at: '2026-05-12T10:00:00+00:00',
      };
      let result: AthleteInvitePreview | null = null;
      const token = 'a'.repeat(64);
      service.preview(token).subscribe((p) => (result = p));

      const req = httpMock.expectOne(`/api/v1/athlete-invite/${token}/preview`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: fixture });

      expect(result).toEqual(fixture);
    });
  });

  describe('accept', () => {
    it('POSTs payload to /api/v1/athlete-invite/:token/accept and returns the data envelope', () => {
      const token = 'b'.repeat(64);
      const payload: AthleteInviteAcceptPayload = {
        password: 'a-strong-password',
        password_confirmation: 'a-strong-password',
        accept_privacy: true,
        accept_terms: true,
      };
      const responseData: AthleteInviteAcceptResponse['data'] = {
        token: 'fake-sanctum-token',
        user: {
          id: 99,
          name: 'Mario Rossi',
          email: 'mario@example.com',
          role: 'athlete',
        },
      };
      let result: AthleteInviteAcceptResponse['data'] | null = null;
      service.accept(token, payload).subscribe((d) => (result = d));

      const req = httpMock.expectOne(`/api/v1/athlete-invite/${token}/accept`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ data: responseData });

      expect(result).toEqual(responseData);
    });
  });
});
