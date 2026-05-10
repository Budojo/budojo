import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ONBOARDING_STEPS, OnboardingService } from './onboarding.service';

describe('OnboardingService (#424)', () => {
  let service: OnboardingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OnboardingService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OnboardingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('exposes the same step keys as the server enum', () => {
    // Snapshot the SPA-side list — the server's
    // OnboardingTest::test('GET /me/onboarding returns the initial empty state')
    // asserts available_steps == OnboardingStep::all() on the same
    // values; this spec pins the SPA side. Any drift here that
    // doesn't update the server enum fails BOTH suites.
    expect([...ONBOARDING_STEPS]).toEqual([
      'add_athlete',
      'log_attendance',
      'mark_payment',
      'upload_document',
      'view_stats',
    ]);
  });

  it('GET /me/onboarding hydrates the state signals', () => {
    service.load().subscribe();
    const req = httpMock.expectOne('/api/v1/me/onboarding');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        dismissed_at: null,
        completed_steps: ['add_athlete'],
        available_steps: ONBOARDING_STEPS,
      },
    });

    expect(service.dismissedAt()).toBeNull();
    expect(service.completedSteps()).toEqual(['add_athlete']);
    expect(service.loaded()).toBe(true);
  });

  it('POST /me/onboarding/steps updates completedSteps from the response', () => {
    service.completeStep('mark_payment').subscribe();
    const req = httpMock.expectOne('/api/v1/me/onboarding/steps');
    expect(req.request.body).toEqual({ step: 'mark_payment' });
    req.flush({ data: { completed_steps: ['add_athlete', 'mark_payment'] } });

    expect(service.completedSteps()).toEqual(['add_athlete', 'mark_payment']);
  });

  it('POST /me/onboarding/dismiss stamps dismissedAt and hides the tour', () => {
    service.dismiss().subscribe();
    const req = httpMock.expectOne('/api/v1/me/onboarding/dismiss');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { dismissed_at: '2026-05-11T08:00:00Z' } });

    expect(service.dismissedAt()).toBe('2026-05-11T08:00:00Z');
    expect(service.tourActive()).toBe(false);
  });

  it('tourActive is false when every step is completed', () => {
    service.load().subscribe();
    httpMock.expectOne('/api/v1/me/onboarding').flush({
      data: {
        dismissed_at: null,
        completed_steps: [...ONBOARDING_STEPS],
        available_steps: ONBOARDING_STEPS,
      },
    });

    expect(service.tourActive()).toBe(false);
    expect(service.progress()).toBe(5);
  });

  it('tourActive is true with partial progress and no dismissal', () => {
    service.load().subscribe();
    httpMock.expectOne('/api/v1/me/onboarding').flush({
      data: {
        dismissed_at: null,
        completed_steps: ['add_athlete'],
        available_steps: ONBOARDING_STEPS,
      },
    });

    expect(service.tourActive()).toBe(true);
    expect(service.progress()).toBe(1);
  });
});
