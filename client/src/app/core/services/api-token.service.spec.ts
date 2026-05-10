import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiTokenService } from './api-token.service';

describe('ApiTokenService (#431)', () => {
  let service: ApiTokenService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiTokenService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiTokenService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GET /me/api-tokens unwraps tokens + abilities catalog', () => {
    let received: { tokens: readonly { id: number }[]; availableAbilities: readonly string[] } = {
      tokens: [],
      availableAbilities: [],
    };
    service.list().subscribe((r) => (received = r));

    const req = httpMock.expectOne('/api/v1/me/api-tokens');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        {
          id: 1,
          name: 'export-script',
          abilities: ['athletes:read'],
          last_used_at: null,
          expires_at: null,
          created_at: '2026-05-11T08:00:00Z',
        },
      ],
      meta: { available_abilities: ['athletes:read', 'athletes:write'] },
    });

    expect(received.tokens.length).toBe(1);
    expect(received.availableAbilities).toEqual(['athletes:read', 'athletes:write']);
  });

  it('POST /me/api-tokens posts the payload and returns the plaintext token', () => {
    let plain: string | null = null;
    service
      .create({ name: 'integration', abilities: ['athletes:read'], expires_in_days: 30 })
      .subscribe((r) => (plain = r.plain_text_token));

    const req = httpMock.expectOne('/api/v1/me/api-tokens');
    expect(req.request.body).toEqual({
      name: 'integration',
      abilities: ['athletes:read'],
      expires_in_days: 30,
    });
    req.flush({
      data: {
        id: 7,
        name: 'integration',
        abilities: ['athletes:read'],
        last_used_at: null,
        expires_at: '2026-06-10T08:00:00Z',
        created_at: '2026-05-11T08:00:00Z',
        plain_text_token: '7|aBc123XyZ',
      },
    });

    expect(plain).toBe('7|aBc123XyZ');
  });

  it('DELETE /me/api-tokens/{id} returns the revoked flag', () => {
    let received: boolean | null = null;
    service.revoke(42).subscribe((r) => (received = r));

    const req = httpMock.expectOne('/api/v1/me/api-tokens/42');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { revoked: true } });

    expect(received).toBe(true);
  });
});
