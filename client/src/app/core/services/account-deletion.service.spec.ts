import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountDeletionService } from './account-deletion.service';

describe('AccountDeletionService (#545)', () => {
  let svc: AccountDeletionService;
  let http: HttpTestingController;
  const token = 'a'.repeat(64);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AccountDeletionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs the token to /me/deletion-request/cancel/<token> with an empty body', () => {
    svc.cancelByToken(token).subscribe();

    const req = http.expectOne(`/api/v1/me/deletion-request/cancel/${token}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ data: { cancelled: true } });
  });

  it('resolves to true on a "cancelled: true" response (active row was removed)', () => {
    let result: boolean | null = null;
    svc.cancelByToken(token).subscribe((v) => (result = v));
    http
      .expectOne(`/api/v1/me/deletion-request/cancel/${token}`)
      .flush({ data: { cancelled: true } });
    expect(result).toBe(true);
  });

  it('resolves to false on a "cancelled: false" response (already-clicked / never valid / grace expired)', () => {
    let result: boolean | null = null;
    svc.cancelByToken(token).subscribe((v) => (result = v));
    http
      .expectOne(`/api/v1/me/deletion-request/cancel/${token}`)
      .flush({ data: { cancelled: false } });
    expect(result).toBe(false);
  });
});
