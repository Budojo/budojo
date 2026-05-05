import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SupportService } from './support.service';

describe('SupportService (#423)', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SupportService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs JSON to /api/v1/support with subject + category + body', () => {
    service
      .submit({
        subject: 'Cannot reset password',
        category: 'account',
        body: 'The reset link 404s every time.',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/support');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      subject: 'Cannot reset password',
      category: 'account',
      body: 'The reset link 404s every time.',
    });

    req.flush(
      { data: { id: 42, created_at: '2026-05-05T10:00:00Z' } },
      { status: 202, statusText: 'Accepted' },
    );
  });

  it('forwards the chosen category verbatim — billing / bug / other', () => {
    const categories: Array<'billing' | 'bug' | 'other'> = ['billing', 'bug', 'other'];

    for (const category of categories) {
      service
        .submit({
          subject: 'Subject for category test',
          category,
          body: 'A reasonably long body text.',
        })
        .subscribe();

      const req = httpMock.expectOne('/api/v1/support');
      expect((req.request.body as { category: string }).category).toBe(category);
      req.flush(
        { data: { id: 1, created_at: '2026-05-05T10:00:00Z' } },
        { status: 202, statusText: 'Accepted' },
      );
    }
  });

  it('propagates a server error to the subscriber', () => {
    let errored = false;

    service
      .submit({
        subject: 'Will fail',
        category: 'bug',
        body: 'Server returns 500 for this test.',
      })
      .subscribe({ error: () => (errored = true) });

    const req = httpMock.expectOne('/api/v1/support');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(errored).toBe(true);
  });
});
