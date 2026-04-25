import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlySummaryWidgetComponent } from './monthly-summary-widget.component';

function makeRow(
  id: number,
  count: number,
): {
  athlete_id: number;
  first_name: string;
  last_name: string;
  count: number;
} {
  return { athlete_id: id, first_name: `First${id}`, last_name: `Last${id}`, count };
}

function setupTestBed(): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [MonthlySummaryWidgetComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  return TestBed.inject(HttpTestingController);
}

describe('MonthlySummaryWidgetComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15)); // April 15, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the current month summary on init and exposes total + top 5', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryWidgetComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 8),
        makeRow(2, 3),
        makeRow(3, 12),
        makeRow(4, 1),
        makeRow(5, 7),
        makeRow(6, 5),
      ],
    });

    expect(fixture.componentInstance['totalDays']()).toBe(36);
    expect(fixture.componentInstance['topRows']()).toHaveLength(5);
    expect(fixture.componentInstance['topRows']().map((r) => r.athlete_id)).toEqual([
      3, 1, 5, 6, 2,
    ]);
    httpMock.verify();
  });

  it('falls back to errored state when the summary call fails', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryWidgetComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance['errored']()).toBe(true);
    expect(fixture.componentInstance['loading']()).toBe(false);
    httpMock.verify();
  });

  it('renders an empty hint when no athlete trained this month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryWidgetComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });

    expect(fixture.componentInstance['rows']()).toEqual([]);
    expect(fixture.componentInstance['totalDays']()).toBe(0);
    httpMock.verify();
  });
});
