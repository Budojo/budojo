import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuditEntriesPage, AuditService } from './audit.service';

function emptyPage(): AuditEntriesPage {
  return {
    data: [],
    meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 },
  };
}

describe('AuditService (#429 part 3)', () => {
  let svc: AuditService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/v1/audit-entries with no params when no filters are set', () => {
    svc.list().subscribe();
    const req = http.expectOne('/api/v1/audit-entries');
    expect(req.request.method).toBe('GET');
    req.flush(emptyPage());
  });

  it('forwards every populated filter as a query param', () => {
    svc
      .list({
        action: 'athlete.deleted',
        actor_user_id: 7,
        from: '2026-05-01',
        to: '2026-05-21',
        subject_type: 'App\\Models\\Athlete',
        subject_id: 42,
        per_page: 50,
        page: 2,
      })
      .subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/v1/audit-entries' && r.params.get('action') === 'athlete.deleted',
    );
    expect(req.request.params.get('actor_user_id')).toBe('7');
    expect(req.request.params.get('from')).toBe('2026-05-01');
    expect(req.request.params.get('to')).toBe('2026-05-21');
    expect(req.request.params.get('subject_type')).toBe('App\\Models\\Athlete');
    expect(req.request.params.get('subject_id')).toBe('42');
    expect(req.request.params.get('per_page')).toBe('50');
    expect(req.request.params.get('page')).toBe('2');
    req.flush(emptyPage());
  });

  it('skips undefined / null / empty-string filter values from the URL', () => {
    svc
      .list({
        action: '',
        actor_user_id: undefined,
        // null cast — TypeScript narrows the optional fields out, but real
        // code paths can drop in a `null` from a form reset.
        from: null as unknown as string,
        to: '2026-05-21',
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/audit-entries');
    expect(req.request.params.has('action')).toBe(false);
    expect(req.request.params.has('actor_user_id')).toBe(false);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.get('to')).toBe('2026-05-21');
    req.flush(emptyPage());
  });

  it('passes the envelope through unchanged (no shape coercion)', () => {
    const expected: AuditEntriesPage = {
      data: [
        {
          id: 1,
          action: 'athlete.deleted',
          actor_user_id: 7,
          actor_label: 'Matteo',
          subject_type: 'App\\Models\\Athlete',
          subject_id: 42,
          subject_label: 'Mario Rossi',
          before: { first_name: 'Mario' },
          after: null,
          ip: '203.0.113.1',
          user_agent: 'CurlBot/1',
          created_at: '2026-05-21T10:00:00+00:00',
        },
      ],
      meta: { current_page: 1, last_page: 1, total: 1, per_page: 20 },
    };
    let received: AuditEntriesPage | null = null;
    svc.list().subscribe((r) => (received = r));

    http.expectOne('/api/v1/audit-entries').flush(expected);
    expect(received).toEqual(expected);
  });
});
