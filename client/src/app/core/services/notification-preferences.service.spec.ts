import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  NotificationPreferences,
  NotificationPreferencesService,
} from './notification-preferences.service';

describe('NotificationPreferencesService (#416)', () => {
  let svc: NotificationPreferencesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(NotificationPreferencesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /me/notification-preferences and unwraps the snapshot', () => {
    let result: NotificationPreferences | null = null;
    svc.show().subscribe((p) => (result = p));

    const req = http.expectOne('/api/v1/me/notification-preferences');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { weeklyDigest: true, newPosts: false } });

    expect(result).toEqual({ weeklyDigest: true, newPosts: false });
  });

  it('PATCHes the supplied partial map wrapped under { preferences: ... }', () => {
    svc.update({ newPosts: false }).subscribe();

    const req = http.expectOne('/api/v1/me/notification-preferences');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ preferences: { newPosts: false } });
    req.flush({ data: { weeklyDigest: true, newPosts: false } });
  });

  it('unwraps the echoed-back full snapshot from the PATCH response', () => {
    let result: NotificationPreferences | null = null;
    svc.update({ newPosts: false }).subscribe((p) => (result = p));

    http
      .expectOne('/api/v1/me/notification-preferences')
      .flush({ data: { weeklyDigest: true, newPosts: false, mentions: true } });

    // The caller learns about a category it didn't touch (mentions)
    // because the server merges + echoes the FULL state — saves a
    // follow-up GET.
    expect(result).toEqual({ weeklyDigest: true, newPosts: false, mentions: true });
  });
});
