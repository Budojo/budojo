import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { MonthlySummaryComponent } from './monthly-summary.component';
import { AcademyService } from '../../../core/services/academy.service';
import { AttendanceSummaryRow } from '../../../core/services/attendance.service';

function makeRow(
  id: number,
  count: number,
  first = `First${id}`,
  last = `Last${id}`,
): AttendanceSummaryRow {
  return { athlete_id: id, first_name: first, last_name: last, count, athlete: null };
}

function withIdentity(row: AttendanceSummaryRow): AttendanceSummaryRow {
  return {
    ...row,
    athlete: {
      id: row.athlete_id,
      first_name: row.first_name,
      last_name: row.last_name,
      belt: 'purple',
      stripes: 2,
      date_of_birth: null,
      photo_url: null,
      user_avatar_url: null,
    },
  };
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

  it('opens on descending count — the question the page is opened with', () => {
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

  it('flips the days column to fewest-first — who has stopped coming (#1526)', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [makeRow(1, 3), makeRow(2, 9), makeRow(3, 6)] });

    fixture.componentInstance['cycleDaysSort']();
    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([1, 3, 2]);
    expect(fixture.componentInstance['daysSortLabel']()).toBe('\u2191');

    // Two presses return where they started.
    fixture.componentInstance['cycleDaysSort']();
    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([2, 3, 1]);
    http.verify();
  });

  it('breaks a shared first name on the last name, in the same direction', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    // Three Marios — the case the primary key cannot decide on its own, and
    // the one every fixture above happens to avoid.
    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 5, 'Mario', 'Rossi'),
        makeRow(2, 3, 'Mario', 'Bianchi'),
        makeRow(3, 7, 'Mario', 'Conti'),
      ],
    });

    const ids = (): number[] => fixture.componentInstance['displayRows']().map((r) => r.athlete_id);

    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([2, 3, 1]); // Bianchi, Conti, Rossi

    // Descending flips the tiebreak with it — otherwise the block of Marios
    // would keep its ascending order under a descending header.
    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([1, 3, 2]);
    http.verify();
  });

  it('breaks a tied day count on the last name, always ascending', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 4, 'Mario', 'Rossi'),
        makeRow(2, 4, 'Luigi', 'Bianchi'),
        makeRow(3, 4, 'Anna', 'Conti'),
      ],
    });

    const ids = (): number[] => fixture.componentInstance['displayRows']().map((r) => r.athlete_id);

    // Bianchi, Conti, Rossi — and the SAME order when the count direction
    // flips, because a tiebreak that flipped too would reshuffle the tied
    // block for no reason the reader asked for.
    expect(ids()).toEqual([2, 3, 1]);
    fixture.componentInstance['cycleDaysSort']();
    expect(ids()).toEqual([2, 3, 1]);
    http.verify();
  });

  it('cycles the athlete column first asc -> first desc -> last asc -> last desc', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 5, 'Mario', 'Rossi'),
        makeRow(2, 3, 'Luigi', 'Bianchi'),
        makeRow(3, 7, 'Anna', 'Verdi'),
      ],
    });

    const ids = (): number[] => fixture.componentInstance['displayRows']().map((r) => r.athlete_id);

    // The days column is the default, so the first press restarts the name
    // cycle at first asc rather than continuing anything.
    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([3, 2, 1]); // Anna, Luigi, Mario
    expect(fixture.componentInstance['nameSortLabel']()).toBe('F\u2191');
    expect(fixture.componentInstance['nameAriaSort']()).toBe('ascending');

    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([1, 2, 3]);
    expect(fixture.componentInstance['nameSortLabel']()).toBe('F\u2193');

    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([2, 1, 3]); // Bianchi, Rossi, Verdi
    expect(fixture.componentInstance['nameSortLabel']()).toBe('L\u2191');

    fixture.componentInstance['cycleNameSort']();
    expect(ids()).toEqual([3, 1, 2]);
    expect(fixture.componentInstance['nameSortLabel']()).toBe('L\u2193');

    // ...and the days header goes neutral while a name drives the sort.
    expect(fixture.componentInstance['daysSortLabel']()).toBeNull();
    expect(fixture.componentInstance['daysAriaSort']()).toBe('none');
    http.verify();
  });

  it('keeps the filter and the order independent', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({
      data: [
        makeRow(1, 5, 'Mario', 'Rossi'),
        makeRow(2, 3, 'Marco', 'Bianchi'),
        makeRow(3, 7, 'Luigi', 'Verdi'),
      ],
    });

    fixture.componentInstance['nameFilter'].set('mar');
    fixture.componentInstance['cycleDaysSort']();

    expect(fixture.componentInstance['displayRows']().map((r) => r.athlete_id)).toEqual([2, 1]);
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

  // ─── What the header actually counts (#1639) ────────────────────────────────

  it('calls the presences presences, and the days the days', () => {
    const { http, setMonthParam } = setupTestBed();
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
    fixture.detectChanges();

    // Ten presences across two athletes, over six sessions actually held.
    // The header used to read "10 giorni di allenamento · 2 atleti".
    const label = fixture.componentInstance['summaryCountLabel']();
    expect(label).toContain('10 attendances');
    expect(label).toContain('2 athletes');
    expect(label).toContain('6 training days');
    http.verify();
  });

  it('says nothing about zero days when the timetable does not reach this month', () => {
    // A timetable configured from a later date answers 0, not null — the
    // header would have read "5 presenze · 1 atleta · 0 giorni di
    // allenamento" beside rows with no fraction.
    const { http, setMonthParam } = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [2, 4, 6],
      schedules: [{ effective_from: '2026-06-01', training_days: [2, 4, 6] }],
    } as never);
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam('2026-01');
    http.expectOne('/api/v1/attendance/summary?month=2026-01').flush({ data: [makeRow(1, 5)] });
    fixture.detectChanges();

    expect(fixture.componentInstance['scheduledCount']()).toBe(0);
    expect(fixture.componentInstance['summaryCountLabel']()).not.toContain('0 training days');
    expect(
      fixture.nativeElement.querySelector('[data-cy="monthly-summary-no-schedule"]'),
    ).not.toBeNull();
    http.verify();
  });

  it('drops the day segment and says why when the month has no timetable', () => {
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
    fixture.detectChanges();

    expect(fixture.componentInstance['summaryCountLabel']()).not.toContain('training day');
    expect(
      fixture.nativeElement.querySelector('[data-cy="monthly-summary-no-schedule"]'),
    ).not.toBeNull();
    http.verify();
  });

  it('folds how the days and the percentage are counted under the header (#1853)', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);
    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [makeRow(1, 5)] });
    fixture.detectChanges();

    const method = fixture.nativeElement.querySelector(
      'details[data-cy="monthly-summary-method"]',
    ) as HTMLDetailsElement;
    expect(method.open).toBe(false);
    // One unit, named as the header names it: the header's "attendances" are
    // days too (#1765), so the fold explains them rather than opposing them.
    expect(method.textContent).toContain("an attendance is one athlete's day of training");
    expect(method.textContent).not.toContain('not the presences');
    http.verify();
  });

  it('keeps the fold mounted, and open, while the next month loads (#1853)', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);
    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [makeRow(1, 5)] });
    fixture.detectChanges();

    const fold = (): HTMLDetailsElement | null =>
      fixture.nativeElement.querySelector('details[data-cy="monthly-summary-method"]');
    const opened = fold() as HTMLDetailsElement;
    opened.open = true;

    // The owner steps back a month: while it loads the old rows stay, and so
    // does the fold. The layout does not jump and the fold does not close.
    setMonthParam('2026-03');
    fixture.detectChanges();
    expect(fold()).toBe(opened);
    expect(fold()?.open).toBe(true);

    http.expectOne('/api/v1/attendance/summary?month=2026-03').flush({ data: [makeRow(2, 3)] });
    fixture.detectChanges();
    expect(fold()).toBe(opened);
    expect(fold()?.open).toBe(true);
    http.verify();
  });

  it('shows no method for an empty month, where there is no number to explain (#1853)', () => {
    const { http, setMonthParam } = setupTestBed();
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    setMonthParam(null);
    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="monthly-summary-method"]')).toBeNull();
    http.verify();
  });

  it("lets a name reach that athlete's own attendance tab", () => {
    // A real router here, not the `{ navigate }` stub the other tests use:
    // `routerLink` needs one to render an href, and the href is the claim.
    TestBed.resetTestingModule();
    const queryParams = new Subject<ReturnType<typeof convertToParamMap>>();
    TestBed.configureTestingModule({
      imports: [MonthlySummaryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        ...provideI18nTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    queryParams.next(convertToParamMap({}));

    http.expectOne('/api/v1/attendance/summary?month=2026-04').flush({ data: [makeRow(7, 3)] });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '[data-cy="monthly-summary-athlete-link-7"]',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/dashboard/athletes/7/attendance');

    // The phone card renders its own anchor from a second template site.
    const mobile = fixture.nativeElement.querySelector(
      '[data-cy="monthly-summary-mobile-athlete-link-7"]',
    ) as HTMLAnchorElement | null;
    expect(mobile?.getAttribute('href')).toBe('/dashboard/athletes/7/attendance');
    http.verify();
  });

  it('draws each person with the belt spine, the name leading to their attendance (#1851)', () => {
    const queryParams = new Subject<ReturnType<typeof convertToParamMap>>();
    TestBed.configureTestingModule({
      imports: [MonthlySummaryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        ...provideI18nTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MonthlySummaryComponent);
    fixture.detectChanges();
    queryParams.next(convertToParamMap({}));

    http
      .expectOne('/api/v1/attendance/summary?month=2026-04')
      .flush({ data: [withIdentity(makeRow(7, 3, 'Anna', 'Bianchi'))] });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    for (const row of [
      '[data-cy="monthly-summary-table-row-7"]',
      '[data-cy="monthly-summary-mobile-row-7"]',
    ]) {
      // The belt is on the row, with its name for a screen reader.
      expect(
        root.querySelector(`${row} [data-cy="belt-spine"]`)?.getAttribute('aria-label'),
      ).toContain('Purple');
      const name = root.querySelector(`${row} [data-cy="athlete-name-link"]`);
      expect(name?.textContent?.trim()).toBe('Anna Bianchi');
      expect(name?.getAttribute('href')).toBe('/dashboard/athletes/7/attendance');
    }
    http.verify();
  });
});
