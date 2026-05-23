import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, it, expect, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';
import { PublicProfile, PublicProfileService } from './public-profile.service';

describe('PublicProfileService', () => {
  let service: PublicProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PublicProfileService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PublicProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /users/{handle}/profile and unwraps the JSON envelope', () => {
    const payload: PublicProfile = {
      id: 42,
      first_name: 'Mario',
      handle: 'mariobjj',
      avatar_url: null,
      belt: 'blue',
      joined_at: '2025-01-15',
      promotions: [],
      achievements: [],
    };

    let received: PublicProfile | null = null;
    service.get('mariobjj').subscribe((profile) => {
      received = profile;
    });

    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_OFFLINE_REDIRECT)).toBe(false);
    req.flush({ data: payload });

    expect(received).toEqual(payload);
  });

  it('getSilent() opts the request out of the offline-redirect (tap-triggered surfaces)', () => {
    service.getSilent('mariobjj').subscribe();

    const req = httpMock.expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`);
    expect(req.request.context.get(SKIP_OFFLINE_REDIRECT)).toBe(true);
    req.flush({
      data: {
        id: 1,
        first_name: 'Mario',
        handle: 'mariobjj',
        avatar_url: null,
        belt: null,
        joined_at: null,
        promotions: [],
        achievements: [],
      },
    });
  });

  it('propagates 404 errors so the caller can render the not-found state', () => {
    let status: number | null = null;
    service.get('ghost').subscribe({
      error: (err) => {
        status = err.status;
      },
    });

    httpMock
      .expectOne(`${environment.apiBase}/api/v1/users/ghost/profile`)
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(status).toBe(404);
  });
});
