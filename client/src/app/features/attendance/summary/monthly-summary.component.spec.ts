import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlySummaryComponent } from './monthly-summary.component';

function makeRow(id: number, count: number, first = `First${id}`, last = `Last${id}`) {
  return { athlete_id: id, first_name: first, last_name: last, count };
}

function setupTestBed(initialMonth: string | null = null): {
  http: HttpTestingController;
  navigate: ReturnType<typeof vi.fn>;
  queryParams: Subject<ReturnType<typeof convertToParamMap>>;
} {
  const queryParams = new Subject<ReturnType<typeof convertToParamMap>>();
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [MonthlySummaryComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: queryParams.asObservable(),
        },
      },
    ],
  });
  // Emit the initial query map after the component subscribes (driven by detectChanges).
  queueMicrotask(() => {
    queryParams.next(convertToParamMap(initialMonth ? { month: initialMonth } : {}));
  });
  return { http: TestBed.inject(HttpTestingController), navigate, queryParams };
}

describe('MonthlySummaryComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the current month on init when no query param is set', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve(); // flush queued microtask

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 5), makeRow(2, 3)] });

    expect(fixture.componentInstance['rows']()).toHaveLength(2);
    http.verify();
  });

  it('uses ?month= from the URL when provided', async () => {
    const { http } = setupTestBed('2026-02');
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http.expectOne('/api/v1/attendance/summary?month=2026-02').flush({ data: [] });
    expect(fixture.componentInstance['visible']()).toEqual({ year: 2026, month: 2 });
    http.verify();
  });

  it('sorts rows by descending count for the table view', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 3), makeRow(2, 9), makeRow(3, 6)] });

    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([2, 3, 1]);
    http.verify();
  });

  it('filters rows by case-insensitive name match', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 5, 'Mario', 'Rossi'),
        makeRow(2, 3, 'Luigi', 'Verdi'),
        makeRow(3, 7, 'Marco', 'Bianchi'),
      ],
    });

    fixture.componentInstance['nameFilter'].set('mar');
    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([3, 1]);
    http.verify();
  });

  it('disables canGoNext when on the current month and re-enables after stepping back', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });
    expect(fixture.componentInstance['canGoNext']()).toBe(false);

    fixture.componentInstance.prevMonth();
    http.expectOne('/api/v1/attendance/summary?month=2026-03').flush({ data: [] });
    expect(fixture.componentInstance['canGoNext']()).toBe(true);
    http.verify();
  });

  it('discards stale month responses that arrive after a newer click', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });

    fixture.componentInstance.prevMonth();
    const marchReq = http.expectOne('/api/v1/attendance/summary?month=2026-03');
    fixture.componentInstance.prevMonth();
    const februaryReq = http.expectOne('/api/v1/attendance/summary?month=2026-02');

    februaryReq.flush({ data: [makeRow(99, 4)] });
    marchReq.flush({ data: [makeRow(88, 9)] });

    expect(fixture.componentInstance['rows']().some((r) => r.athlete_id === 99)).toBe(true);
    expect(fixture.componentInstance['rows']().some((r) => r.athlete_id === 88)).toBe(false);
    http.verify();
  });

  it('falls back to errored state when the request fails', async () => {
    const { http } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    await Promise.resolve();

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance['errored']()).toBe(true);
    expect(fixture.componentInstance['rows']()).toEqual([]);
    http.verify();
  });
});
