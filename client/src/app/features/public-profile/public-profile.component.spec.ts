import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, beforeEach, it, expect, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { PublicProfile, PublicProfilePromotion } from '../../core/services/public-profile.service';
import { PublicProfileComponent } from './public-profile.component';

function makeProfile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 42,
    first_name: 'Mario',
    handle: 'mariobjj',
    avatar_url: null,
    belt: 'blue',
    joined_at: '2025-01-15',
    promotions: [],
    achievements: [],
    ...overrides,
  };
}

function makePromotion(overrides: Partial<PublicProfilePromotion> = {}): PublicProfilePromotion {
  return {
    id: 1,
    kind: 'belt',
    from_belt: 'white',
    to_belt: 'blue',
    from_stripes: null,
    to_stripes: null,
    belt_at_event: 'blue',
    recorded_at: '2026-01-15T10:00:00+00:00',
    ...overrides,
  };
}

function setupTestBed(handle: string | null = 'mariobjj'): { http: HttpTestingController } {
  const paramMap = convertToParamMap(handle === null ? {} : { handle });
  TestBed.configureTestingModule({
    imports: [PublicProfileComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(paramMap), snapshot: { paramMap } },
      },
      ...provideI18nTesting(),
    ],
  });
  return { http: TestBed.inject(HttpTestingController) };
}

describe('PublicProfileComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    ({ http } = setupTestBed());
  });

  afterEach(() => {
    http.verify();
  });

  it('renders the profile identity once the API resolves', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`)
      .flush({ data: makeProfile() });

    fixture.detectChanges();
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Mario');
    expect(html).toContain('@mariobjj');
  });

  it('renders the promotions timeline newest-first', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http.expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`).flush({
      data: makeProfile({
        promotions: [
          makePromotion({ id: 2, kind: 'stripe', from_stripes: 0, to_stripes: 1 }),
          makePromotion({ id: 1, kind: 'belt', from_belt: 'white', to_belt: 'blue' }),
        ],
      }),
    });

    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll(
      '.public-profile-timeline-row',
    ) as NodeListOf<HTMLElement>;
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Stripes/i);
    expect(rows[1].textContent).toMatch(/Promoted from/i);
  });

  it('falls back to the not-found state on 404 — no existence leak', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`)
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    fixture.detectChanges();
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Profile not available');
  });

  it('renders the empty state when the athlete has no promotions yet', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`)
      .flush({ data: makeProfile({ promotions: [] }) });

    fixture.detectChanges();
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('No promotions recorded yet.');
  });

  it('renders the achievements row when the profile carries badges (#961)', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http.expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`).flush({
      data: makeProfile({
        promotions: [],
        achievements: [
          { kind: 'first_class', unlocked_at: '2026-04-01T10:00:00Z', metadata: null },
          { kind: '30_day_streak', unlocked_at: '2026-05-01T10:00:00Z', metadata: { days: 30 } },
        ],
      }),
    });

    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelector('[data-cy="public-profile-badges"]');
    expect(badges).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="badge-first_class"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="badge-30_day_streak"]')).not.toBeNull();
  });

  it('omits the achievements row when the profile has no badges yet', () => {
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiBase}/api/v1/users/mariobjj/profile`)
      .flush({ data: makeProfile({ achievements: [] }) });

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="public-profile-badges"]')).toBeNull();
  });
});

describe('PublicProfileComponent — missing handle param', () => {
  it('shows the not-found state when the route has no :handle', () => {
    setupTestBed(null);
    const fixture = TestBed.createComponent(PublicProfileComponent);
    fixture.detectChanges();

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Profile not available');
  });
});
