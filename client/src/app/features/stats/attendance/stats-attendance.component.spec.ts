import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsAttendanceComponent } from './stats-attendance.component';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('StatsAttendanceComponent', () => {
  let fixture: ComponentFixture<StatsAttendanceComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsAttendanceComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsAttendanceComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows the loading skeleton while fetching', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-cy="stats-attendance-loading"]'),
    ).toBeTruthy();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({ data: [] });
  });

  it('shows the empty state when every bucket is 0/0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({
      data: Array.from({ length: 12 }, (_, i) => ({
        month: `2026-${i + 1}`,
        active: 0,
        paused: 0,
      })),
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-empty"]')).toBeTruthy();
  });

  it('renders the chart when data is populated', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({
      data: [{ month: '2026-05', active: 3, paused: 1 }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-chart"]')).toBeTruthy();
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-error"]')).toBeTruthy();
  });
});
