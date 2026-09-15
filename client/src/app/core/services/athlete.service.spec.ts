import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  Athlete,
  AthleteInvitation,
  AthletePayload,
  AthletePromotion,
  AthleteService,
  AthleteUpdatePayload,
} from './athlete.service';

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

  describe('athlete invitations (#445, M7 PR-B)', () => {
    function makeInvitation(overrides: Partial<AthleteInvitation> = {}): AthleteInvitation {
      return {
        id: 1,
        athlete_id: 7,
        email: 'mario@example.com',
        expires_at: '2026-05-12T10:00:00+00:00',
        accepted_at: null,
        revoked_at: null,
        last_sent_at: '2026-05-05T10:00:00+00:00',
        state: 'pending',
        ...overrides,
      };
    }

    it('POSTs to /api/v1/athletes/:id/invite and returns the invitation envelope', () => {
      const invitation = makeInvitation();
      let result: AthleteInvitation | null = null;
      service.invite(7).subscribe((i) => (result = i));

      const req = httpMock.expectOne('/api/v1/athletes/7/invite');
      expect(req.request.method).toBe('POST');
      // Empty body — the request carries no user-supplied fields;
      // the invite is fully derived from the route-bound athlete.
      expect(req.request.body).toEqual({});
      req.flush({ data: invitation });

      expect(result).toEqual(invitation);
    });

    it('POSTs to /api/v1/athletes/:id/invite/resend and returns the refreshed invitation', () => {
      const invitation = makeInvitation({ last_sent_at: '2026-05-05T11:00:00+00:00' });
      let result: AthleteInvitation | null = null;
      service.resendInvite(7).subscribe((i) => (result = i));

      const req = httpMock.expectOne('/api/v1/athletes/7/invite/resend');
      expect(req.request.method).toBe('POST');
      req.flush({ data: invitation });

      expect(result).toEqual(invitation);
    });

    it('DELETEs /api/v1/athletes/:athleteId/invitations/:invitationId to revoke', () => {
      service.revokeInvite(7, 99).subscribe();
      const req = httpMock.expectOne('/api/v1/athletes/7/invitations/99');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('updatePromotionRecordedAt (#1431 PR 1 of 2)', () => {
    it('PATCHes /api/v1/athletes/:athleteId/promotions/:promotionId with the new date and unwraps the data envelope', () => {
      const updated: AthletePromotion = {
        id: 12,
        kind: 'stripe',
        from_belt: null,
        to_belt: null,
        from_stripes: 1,
        to_stripes: 2,
        belt_at_event: 'blue',
        recorded_at: '2026-03-15T00:00:00+00:00',
        recorded_by: { id: 1, full_name: 'Owner User' },
      };
      let result: AthletePromotion | null = null;
      service.updatePromotionRecordedAt(7, 12, '2026-03-15').subscribe((p) => (result = p));

      const req = httpMock.expectOne('/api/v1/athletes/7/promotions/12');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ recorded_at: '2026-03-15' });
      req.flush({ data: updated });

      expect(result).toEqual(updated);
    });
  });

  describe('createPromotion (#1431 PR 2 of 2)', () => {
    it('POSTs the belt payload as-is and unwraps the data envelope', () => {
      const created: AthletePromotion = {
        id: 50,
        kind: 'belt',
        from_belt: 'white',
        to_belt: 'blue',
        from_stripes: null,
        to_stripes: null,
        belt_at_event: 'blue',
        recorded_at: '2019-03-15T00:00:00+00:00',
        recorded_by: { id: 1, full_name: 'Owner User' },
      };
      let result: AthletePromotion | null = null;
      service
        .createPromotion(7, {
          kind: 'belt',
          recorded_at: '2019-03-15',
          from_belt: 'white',
          to_belt: 'blue',
        })
        .subscribe((p) => (result = p));

      const req = httpMock.expectOne('/api/v1/athletes/7/promotions');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        kind: 'belt',
        recorded_at: '2019-03-15',
        from_belt: 'white',
        to_belt: 'blue',
      });
      req.flush({ data: created });

      expect(result).toEqual(created);
    });

    it('POSTs the stripe payload as-is', () => {
      service
        .createPromotion(7, {
          kind: 'stripe',
          recorded_at: '2020-06-01',
          from_stripes: 1,
          to_stripes: 2,
          belt_at_event: 'blue',
        })
        .subscribe();

      const req = httpMock.expectOne('/api/v1/athletes/7/promotions');
      expect(req.request.body).toEqual({
        kind: 'stripe',
        recorded_at: '2020-06-01',
        from_stripes: 1,
        to_stripes: 2,
        belt_at_event: 'blue',
      });
      req.flush({ data: {} });
    });
  });

  describe('deletePromotion (#1431 PR 2 of 2)', () => {
    it('DELETEs /api/v1/athletes/:athleteId/promotions/:promotionId', () => {
      service.deletePromotion(7, 12).subscribe();
      const req = httpMock.expectOne('/api/v1/athletes/7/promotions/12');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('countInactive', () => {
    it('asks for the inactive only, and answers with the total alone', () => {
      let answer: number | undefined;
      service.countInactive().subscribe((n) => (answer = n));

      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes' && r.params.get('status') === 'inactive',
      );
      expect(req.request.method).toBe('GET');
      // Page 1 is enough: only `meta.total` is read, and the rows come along
      // because the index has no count-only mode.
      expect(req.request.params.get('page')).toBe('1');
      // Not an unfiltered count. Asking for everyone would include the bin,
      // and the empty state's "tutti segnati come non attivi" would be false
      // whenever a deleted athlete existed (#1666).
      expect(req.request.params.get('status')).not.toBeNull();

      req.flush({
        data: [],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 7 },
      });
      expect(answer).toBe(7);
    });
  });
});
