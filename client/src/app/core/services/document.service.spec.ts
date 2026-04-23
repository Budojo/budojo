import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Document, DocumentService } from './document.service';

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    athlete_id: 42,
    type: 'medical_certificate',
    original_name: 'med.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    issued_at: '2026-01-01',
    expires_at: '2027-01-01',
    notes: null,
    created_at: '2026-04-23T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

describe('DocumentService', () => {
  let service: DocumentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DocumentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('list', () => {
    it('GETs /api/v1/athletes/:id/documents without the trashed param by default', () => {
      service.list(42).subscribe();
      const req = httpMock.expectOne('/api/v1/athletes/42/documents');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('trashed')).toBe(false);
      req.flush({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 50 } });
    });

    it('adds ?trashed=1 when includeCancelled is true', () => {
      service.list(42, { includeCancelled: true }).subscribe();
      const req = httpMock.expectOne(
        (r) => r.url === '/api/v1/athletes/42/documents' && r.params.get('trashed') === '1',
      );
      req.flush({ data: [] });
    });

    it('returns the raw list response envelope', () => {
      const active = makeDoc({ id: 1 });
      const tombstone = makeDoc({ id: 2, deleted_at: '2026-04-20T10:00:00+00:00' });
      let result: Document[] = [];

      service.list(42, { includeCancelled: true }).subscribe((r) => (result = r.data));
      const req = httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/documents');
      req.flush({ data: [active, tombstone] });

      expect(result).toHaveLength(2);
      expect(result[0].deleted_at).toBeNull();
      expect(result[1].deleted_at).not.toBeNull();
    });
  });

  describe('upload', () => {
    it('POSTs multipart /api/v1/athletes/:id/documents and returns the created Document', () => {
      const file = new File(['pdf'], 'med_2026.pdf', { type: 'application/pdf' });
      const body = new FormData();
      body.append('type', 'medical_certificate');
      body.append('file', file);
      body.append('issued_at', '2026-01-01');

      let received: Document | undefined;
      service.upload(42, body).subscribe((d) => (received = d));

      const req = httpMock.expectOne('/api/v1/athletes/42/documents');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(body);
      // Angular HttpClient auto-sets the Content-Type with boundary for FormData.
      // We assert we did NOT force `application/json` — that would break multipart.
      expect(req.request.headers.get('Content-Type')).toBeNull();

      req.flush({ data: makeDoc({ id: 101, original_name: 'med_2026.pdf' }) });

      expect(received?.id).toBe(101);
      expect(received?.original_name).toBe('med_2026.pdf');
    });

    it('propagates 422 errors to the subscriber (no swallow, no retry)', () => {
      const body = new FormData();
      body.append('type', 'medical_certificate');

      let status: number | undefined;
      service.upload(42, body).subscribe({ error: (e: { status: number }) => (status = e.status) });

      httpMock.expectOne('/api/v1/athletes/42/documents').flush(
        {
          message: 'The file field is required.',
          errors: { file: ['The file field is required.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(status).toBe(422);
    });
  });

  describe('delete', () => {
    it('DELETEs /api/v1/documents/:id', () => {
      service.delete(7).subscribe();
      const req = httpMock.expectOne('/api/v1/documents/7');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('download', () => {
    it('requests the blob via HttpClient so the auth interceptor attaches the token', () => {
      let received: Blob | null = null;
      service.download({ id: 99, original_name: 'foo.pdf' }).subscribe((b) => (received = b));

      const req = httpMock.expectOne('/api/v1/documents/99/download');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
      req.flush(blob);
      expect(received).toBeInstanceOf(Blob);
    });
  });

  describe('downloadUrl', () => {
    it('returns the canonical /api/v1 path', () => {
      expect(service.downloadUrl(99)).toBe('/api/v1/documents/99/download');
    });
  });
});
