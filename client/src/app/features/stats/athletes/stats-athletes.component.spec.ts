import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsAthletesComponent } from './stats-athletes.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

const MOCK_BANDS_PAYLOAD = {
  bands: [
    { code: 'junior', category: 'kids', min: 13, max: 15, count: 5 },
    { code: 'adult', category: 'adults', min: 18, max: null, count: 20 },
    { code: 'master_1', category: 'adults', min: 30, max: 35, count: 12 },
  ],
  total: 37,
  missing_dob: 2,
};

describe('StatsAthletesComponent', () => {
  let fixture: ComponentFixture<StatsAthletesComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsAthletesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsAthletesComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the chart and scope toolbar after data loads with non-zero bands', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-chart"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-scope"]')).toBeTruthy();
  });

  it('shows the missing-dob hint only when missing_dob > 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
    fixture.detectChanges();

    const hint = fixture.nativeElement.querySelector('[data-cy="stats-athletes-missing"]');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('2');
  });

  it('does not show the missing-dob hint when missing_dob is 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({
      data: { ...MOCK_BANDS_PAYLOAD, missing_dob: 0 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-missing"]')).toBeFalsy();
  });

  it('shows the empty state when total === 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({
      data: { bands: [], total: 0, missing_dob: 0 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-empty"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-chart"]')).toBeFalsy();
  });

  it('shows the loading skeleton while fetching', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-loading"]')).toBeTruthy();
    http.expectOne('/api/v1/stats/athletes/age-bands').flush({ data: MOCK_BANDS_PAYLOAD });
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/athletes/age-bands').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="stats-athletes-error"]')).toBeTruthy();
  });
});
