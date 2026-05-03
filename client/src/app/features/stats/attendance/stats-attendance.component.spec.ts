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
    http.expectOne('/api/v1/stats/attendance/daily?months=3').flush({ data: [] });
  });

  it('shows the empty state when no points are returned', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/daily?months=3').flush({ data: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-empty"]')).toBeTruthy();
  });

  it('renders the heatmap when data is populated', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/daily?months=3').flush({
      data: [{ date: '2026-05-01', count: 5 }],
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-cy="stats-attendance-heatmap"]'),
    ).toBeTruthy();
  });

  it('shows the error state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/stats/attendance/daily?months=3').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="stats-attendance-error"]')).toBeTruthy();
  });
});
