import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AttendanceSummary } from '../../../core/services/attendance-summary.service';
import { AttendanceSummaryChartComponent } from './attendance-summary-chart.component';

@Component({
  standalone: true,
  imports: [AttendanceSummaryChartComponent],
  template: `<app-attendance-summary-chart [athleteId]="athleteId" />`,
})
class HostComponent {
  athleteId = 42;
}

function setup(): { fixture: ComponentFixture<HostComponent>; http: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideAnimationsAsync(),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideI18nTesting(),
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function flush(http: HttpTestingController, payload: AttendanceSummary, range = 90): void {
  http.expectOne(`/api/v1/athletes/42/attendance/summary?range=${range}`).flush({ data: payload });
}

function makePayload(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    range_days: 90,
    range_start: '2026-02-20',
    range_end: '2026-05-20',
    attended_count: 3,
    expected_count: 4,
    rate: 0.75,
    series: [
      { date: '2026-03-01', attended: true },
      { date: '2026-03-15', attended: true },
      { date: '2026-04-01', attended: true },
      { date: '2026-04-15', attended: false },
    ],
    ...overrides,
  };
}

describe('AttendanceSummaryChartComponent (#894)', () => {
  it('renders the headline rate after a successful fetch', async () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    flush(http, makePayload());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rate = fixture.nativeElement.querySelector('[data-cy="attendance-summary-rate"]');
    expect(rate?.textContent?.trim()).toBe('75%');
  });

  it('renders the empty-state block when expected_count is 0 (no lessons in the window)', async () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    flush(http, makePayload({ attended_count: 0, expected_count: 0, rate: null, series: [] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-cy="attendance-summary-empty"]')).not.toBeNull();
    // CRITICAL: the empty state must NOT render "0%" — that'd be misleading.
    expect(el.querySelector('[data-cy="attendance-summary-rate"]')).toBeNull();
  });

  it('renders the error block when the fetch fails', async () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http
      .expectOne('/api/v1/athletes/42/attendance/summary?range=90')
      .error(new ProgressEvent('err'), { status: 500, statusText: 'ISE' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="attendance-summary-error"]'),
    ).not.toBeNull();
  });

  it('rounds the rate to the nearest integer percent (Math.round, not floor)', async () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    flush(http, makePayload({ rate: 0.667, attended_count: 2, expected_count: 3 }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rate = fixture.nativeElement.querySelector('[data-cy="attendance-summary-rate"]');
    expect(rate?.textContent?.trim()).toBe('67%');
  });
});
