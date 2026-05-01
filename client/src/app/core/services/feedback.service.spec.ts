import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FeedbackService } from './feedback.service';
import { VERSION } from '../../../environments/version';

describe('FeedbackService (#311)', () => {
  let service: FeedbackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FeedbackService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeedbackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs FormData to /api/v1/feedback with subject + description + app_version', () => {
    service
      .submit({
        subject: 'Athletes list paid filter sticky',
        description: 'Clearing the filter still keeps the URL param.',
        image: null,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);

    const body = req.request.body as FormData;
    expect(body.get('subject')).toBe('Athletes list paid filter sticky');
    expect(body.get('description')).toBe('Clearing the filter still keeps the URL param.');
    expect(body.get('app_version')).toBe(VERSION.tag);
    expect(body.has('image')).toBe(false);

    // Content-Type MUST be auto-set by HttpClient so the multipart
    // boundary is included; setting it manually breaks server parsing.
    expect(req.request.headers.get('Content-Type')).toBeNull();

    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('appends the image with its filename when an attachment is provided', () => {
    const file = new File(['x'], 'screenshot.png', { type: 'image/png' });

    service
      .submit({
        subject: 'Layout broken',
        description: 'See the attached screenshot for context.',
        image: file,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/feedback');
    const body = req.request.body as FormData;
    const attached = body.get('image');
    expect(attached).toBeInstanceOf(File);
    expect((attached as File).name).toBe('screenshot.png');
    expect((attached as File).type).toBe('image/png');

    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('propagates a server error to the subscriber', () => {
    let errored = false;

    service
      .submit({
        subject: 'Will fail',
        description: 'Server returns 500 for this test.',
        image: null,
      })
      .subscribe({ error: () => (errored = true) });

    const req = httpMock.expectOne('/api/v1/feedback');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(errored).toBe(true);
  });
});
