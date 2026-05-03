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

  it('shows the empty state when every bucket has training_days = 0', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({
      data: Array.from({ length: 12 }, (_, i) => ({
        month: `2026-${String(i + 1).padStart(2, '0')}`,
        attendance_count: 0,
        training_days: 0,
      })),
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-empty"]')).toBeTruthy();
  });

  it('renders the chart when data is populated', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({
      data: [{ month: '2026-05', attendance_count: 30, training_days: 10 }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-chart"]')).toBeTruthy();
  });

  it('computes chart data with a single dataset with matching data and backgroundColor lengths', () => {
    fixture.detectChanges();
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      attendance_count: (i + 1) * 10,
      training_days: i + 1,
    }));
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').flush({ data: buckets });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      chartData: () => { datasets: { data: number[]; backgroundColor: string[] }[] };
    };
    const chartData = component.chartData();
    expect(chartData.datasets).toHaveLength(1);
    expect(chartData.datasets[0].data.length).toBe(12);
    expect(chartData.datasets[0].backgroundColor.length).toBe(12);
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/monthly?months=12').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-error"]')).toBeTruthy();
  });
});
