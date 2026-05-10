import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TwoFactorService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TwoFactorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GET /me/two-factor unwraps the data envelope', () => {
    let received: { enabled: boolean; pending: boolean; recovery_codes_remaining: number } | null =
      null;
    service.status().subscribe((s) => (received = s));

    const req = httpMock.expectOne('/api/v1/me/two-factor');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { enabled: true, pending: false, recovery_codes_remaining: 6 } });

    expect(received).toEqual({ enabled: true, pending: false, recovery_codes_remaining: 6 });
  });

  it('POST /me/two-factor/enrol returns secret + provisioning URI', () => {
    let received: { secret: string; provisioning_uri: string } | null = null;
    service.enrol().subscribe((r) => (received = r));

    const req = httpMock.expectOne('/api/v1/me/two-factor/enrol');
    expect(req.request.method).toBe('POST');
    req.flush({
      data: { secret: 'JBSWY3DPEHPK3PXP', provisioning_uri: 'otpauth://totp/...' },
    });

    expect(received).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      provisioning_uri: 'otpauth://totp/...',
    });
  });

  it('POST /me/two-factor/confirm posts the code and returns the recovery codes', () => {
    let received: readonly string[] = [];
    service.confirm('123456').subscribe((codes) => (received = codes));

    const req = httpMock.expectOne('/api/v1/me/two-factor/confirm');
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({ data: { recovery_codes: ['AAAA-1111', 'BBBB-2222'] } });

    expect(received).toEqual(['AAAA-1111', 'BBBB-2222']);
  });

  it('POST /me/two-factor/recovery-codes/regenerate returns the fresh codes', () => {
    let received: readonly string[] = [];
    service.regenerateRecoveryCodes().subscribe((codes) => (received = codes));

    const req = httpMock.expectOne('/api/v1/me/two-factor/recovery-codes/regenerate');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { recovery_codes: ['NEW1-1111'] } });

    expect(received).toEqual(['NEW1-1111']);
  });

  it('DELETE /me/two-factor sends the password in the body', () => {
    let received: boolean | null = null;
    service.disable('s3cret').subscribe((r) => (received = r));

    const req = httpMock.expectOne('/api/v1/me/two-factor');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 's3cret' });
    req.flush({ data: { disabled: true } });

    expect(received).toBe(true);
  });
});
