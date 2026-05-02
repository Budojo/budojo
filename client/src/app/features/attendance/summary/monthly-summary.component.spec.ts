import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { MonthlySummaryComponent } from './monthly-summary.component';
import { AcademyService } from '../../../core/services/academy.service';

function makeRow(id: number, count: number, first = `First${id}`, last = `Last${id}`) {
  return { athlete_id: id, first_name: first, last_name: last, count };
}

interface Harness {
  http: HttpTestingController;
  navigate: ReturnType<typeof vi.fn>;
  setMonthParam(month: string | null): void;
}

function setupTestBed(): Harness {
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
      ...provideI18nTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    navigate,
    setMonthParam(month: string | null) {
      queryParams.next(convertToParamMap(month ? { month } : {}));
    },
  };
}

describe('MonthlySummaryComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the current month when no query param is set', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 5), makeRow(2, 3)] });

    expect(fixture.componentInstance['rows']()).toHaveLength(2);
    http.verify();
  });

  it('uses ?month= from the URL when provided', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam('2026-02');

    http.expectOne('/api/v1/attendance/summary?month=2026-02').flush({ data: [] });
    expect(fixture.componentInstance['visible']()).toEqual({ year: 2026, month: 2 });
    http.verify();
  });

  it('clamps a future ?month= back to the current month and re-syncs the URL', () => {
    const { http, navigate, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();

    // Hand-crafted future month — server has no data here, PRD bans it.
    setMonthParam('2030-01');

    // No request should have fired yet (we punted to the re-sync round-trip).
    http.expectNone('/api/v1/attendance/summary?month=2030-01');

    expect(navigate).toHaveBeenCalled();
    const lastCallArgs = navigate.mock.calls.at(-1);
    expect(lastCallArgs?.[1]?.queryParams).toEqual({ month: '2026-04' });

    // Simulate the navigate emitting the corrected query param.
    setMonthParam('2026-04');
    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });
    expect(fixture.componentInstance['visible']()).toEqual({ year: 2026, month: 4 });
    http.verify();
  });

  it('sorts rows by descending count for the table view', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 3), makeRow(2, 9), makeRow(3, 6)] });

    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([2, 3, 1]);
    http.verify();
  });

  it('filters rows by case-insensitive name match', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

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

  it('navigates with the new month on prev/next without firing a duplicate load', () => {
    const { http, navigate, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });
    expect(fixture.componentInstance['canGoNext']()).toBe(false);

    fixture.componentInstance.prevMonth();
    // prevMonth must NOT trigger a direct load — the navigate is the trigger.
    http.expectNone('/api/v1/attendance/summary?month=2026-03');
    expect(navigate.mock.calls.at(-1)?.[1]?.queryParams).toEqual({ month: '2026-03' });

    // Simulate the URL emitting after navigate resolves.
    setMonthParam('2026-03');
    http.expectOne('/api/v1/attendance/summary?month=2026-03').flush({ data: [] });
    expect(fixture.componentInstance['canGoNext']()).toBe(true);
    http.verify();
  });

  it('discards stale month responses that arrive after a newer URL change', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });

    setMonthParam('2026-03');
    const marchReq = http.expectOne('/api/v1/attendance/summary?month=2026-03');
    setMonthParam('2026-02');
    const februaryReq = http.expectOne('/api/v1/attendance/summary?month=2026-02');

    februaryReq.flush({ data: [makeRow(99, 4)] });
    marchReq.flush({ data: [makeRow(88, 9)] });

    expect(fixture.componentInstance['rows']().some((r) => r.athlete_id === 99)).toBe(true);
    expect(fixture.componentInstance['rows']().some((r) => r.athlete_id === 88)).toBe(false);
    http.verify();
  });

  it('falls back to errored state when the request fails', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance['errored']()).toBe(true);
    expect(fixture.componentInstance['rows']()).toEqual([]);
    http.verify();
  });

  // ─── Scheduled denominator (#88b) ───────────────────────────────────────────

  it('exposes scheduledCount + per-row ratePercent when academy.training_days is configured', () => {
    const { http, setMonthParam } = setupTestBed();
    // System time Apr 15 2026. Schedule [2, 4, 6] = Tue/Thu/Sat.
    // April Tue/Thu/Sat through Apr 15: 6 sessions held.
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [2, 4, 6],
    });
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 4), makeRow(2, 6)] });

    expect(fixture.componentInstance['scheduledCount']()).toBe(6);
    // 4/6 → 67%, 6/6 → 100%.
    expect(fixture.componentInstance.ratePercent(4)).toBe(67);
    expect(fixture.componentInstance.ratePercent(6)).toBe(100);
    http.verify();
  });

  it('returns null counters when training_days is unconfigured (rows fall back to bare count)', () => {
    const { http, setMonthParam } = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: null,
    });
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [makeRow(1, 5)] });

    expect(fixture.componentInstance['scheduledCount']()).toBeNull();
    expect(fixture.componentInstance.ratePercent(5)).toBeNull();
    http.verify();
  });
});
