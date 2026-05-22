import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyAttendanceComponent } from './my-attendance.component';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import type { AttendanceRecord } from '../../core/services/attendance.service';

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 1,
    athlete_id: 1,
    attended_on: '2026-05-01',
    notes: null,
    source: 'instructor',
    created_at: '2026-05-01T19:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [MyAttendanceComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MyAttendanceComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('MyAttendanceComponent (M7 PR-D slice 3)', () => {
  it('shows the loading skeleton on first render', () => {
    const { el, http } = setup();
    expect(el.querySelector('[data-cy="my-attendance-loading"]')).not.toBeNull();
    http.expectOne(`${environment.apiBase}/api/v1/me/attendance`).flush({ data: [] });
  });

  it('renders the empty state when the user has zero records', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/attendance`).flush({ data: [] });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-attendance-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-attendance-list"]')).toBeNull();
  });

  it('renders the no-profile state on 404', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/attendance`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-attendance-no-profile"]')).not.toBeNull();
  });

  it('renders the populated list + summary count', () => {
    const { fixture, el, http } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/attendance`).flush({
      data: [
        record({ id: 1, attended_on: '2026-05-01' }),
        record({ id: 2, attended_on: '2026-04-15', notes: 'Sparring round' }),
      ],
    });
    fixture.detectChanges();

    // Scope the row count to the list so the `<app-attendance-summary-chart>`
    // children (which also start with `attendance-...`) don't bleed in.
    expect(
      el.querySelectorAll('[data-cy="my-attendance-list"] [data-cy^="attendance-"]'),
    ).toHaveLength(2);
    // The chart fires its own GET — drain so afterEach `http.verify()`
    // stays clean. Payload doesn't matter for this list-focused spec.
    http
      .expectOne((r) => r.url.endsWith('/attendance/summary'))
      .flush({
        data: {
          range_days: 90,
          range_start: '2026-02-20',
          range_end: '2026-05-20',
          attended_count: 0,
          expected_count: 0,
          rate: null,
          series: [],
        },
      });
    expect(
      el.querySelector('[data-cy="attendance-2"] .my-attendance__notes')?.textContent,
    ).toContain('Sparring round');
    expect(el.querySelector('[data-cy="my-attendance-summary"]')).not.toBeNull();
  });

  it('renders the error state on 500', () => {
    const { fixture, el, http } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/attendance`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-attendance-error"]')).not.toBeNull();
  });
});
