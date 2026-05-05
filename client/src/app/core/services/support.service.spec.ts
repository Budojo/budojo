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

  it('POSTs multipart to /api/v1/support with subject + category + body when no image', () => {
    service
      .submit({
        subject: 'Cannot reset password',
        category: 'account',
        body: 'The reset link 404s every time.',
        image: null,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/support');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);

    const form = req.request.body as FormData;
    expect(form.get('subject')).toBe('Cannot reset password');
    expect(form.get('category')).toBe('account');
    expect(form.get('body')).toBe('The reset link 404s every time.');
    // No image was supplied — the multipart must NOT carry an empty
    // `image` part (the server's `nullable|file` rule treats an empty
    // string as a missing file, but a present-but-empty multipart entry
    // would still trip Laravel's UploadedFile resolution).
    expect(form.has('image')).toBe(false);

    req.flush(
      { data: { id: 42, created_at: '2026-05-05T10:00:00Z' } },
      { status: 202, statusText: 'Accepted' },
    );
  });

  it('appends the image part to the multipart body when one is supplied', () => {
    const file = new File(['fake-png'], 'screenshot.png', { type: 'image/png' });

    service
      .submit({
        subject: 'Bug with screenshot',
        category: 'bug',
        body: 'See the attached screenshot.',
        image: file,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/support');
    const form = req.request.body as FormData;
    expect(form.get('image')).toBe(file);

    req.flush(
      { data: { id: 1, created_at: '2026-05-05T10:00:00Z' } },
      { status: 202, statusText: 'Accepted' },
    );
  });

  it('forwards the chosen category verbatim — billing / bug / feedback / other', () => {
    const categories: Array<'billing' | 'bug' | 'feedback' | 'other'> = [
      'billing',
      'bug',
      'feedback',
      'other',
    ];

    for (const category of categories) {
      service
        .submit({
          subject: 'Subject for category test',
          category,
          body: 'A reasonably long body text.',
          image: null,
        })
        .subscribe();

      const req = httpMock.expectOne('/api/v1/support');
      expect((req.request.body as FormData).get('category')).toBe(category);
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
        image: null,
      })
      .subscribe({ error: () => (errored = true) });

    const req = httpMock.expectOne('/api/v1/support');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(errored).toBe(true);
  });
});
