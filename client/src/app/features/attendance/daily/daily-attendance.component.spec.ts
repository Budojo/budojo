import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AcademyClass } from '../../../core/services/academy-class.service';
import { AcademyService } from '../../../core/services/academy.service';
import { Athlete } from '../../../core/services/athlete.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { DailyAttendanceComponent } from './daily-attendance.component';

const ACADEMY_BASE = {
  id: 1,
  name: 'Test',
  slug: 'test',
  address: null,
  logo_url: null,
} as const;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 1,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: null,
    belt: 'blue',
    stripes: 0,
    status: 'active',
    joined_at: '2025-01-01',
    created_at: '2025-01-01T10:00:00+00:00',
    ...overrides,
  };
}

interface Harness {
  fixture: ReturnType<typeof TestBed.createComponent<DailyAttendanceComponent>>;
  component: DailyAttendanceComponent;
  httpMock: HttpTestingController;
}

function setup(): Harness {
  TestBed.configureTestingModule({
    imports: [DailyAttendanceComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(DailyAttendanceComponent);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/**
 * Settle the initial requests: the roster, the timetable, then the day's
 * attendance — in that order, because the attendance fetch waits for the
 * timetable (#1562): which class is selected decides which records to ask
 * for.
 */
function flushInit(
  httpMock: HttpTestingController,
  opts: {
    athletes?: Athlete[];
    meta?: { total: number };
    presentRecords?: { id: number; athlete_id: number; attended_on: string }[];
    classes?: AcademyClass[];
  },
): void {
  const athletes = opts.athletes ?? [];
  const total = opts.meta?.total ?? athletes.length;

  httpMock
    .expectOne((r) => r.url === '/api/v1/athletes')
    .flush({
      data: athletes,
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: 1,
        from: athletes.length ? 1 : null,
        last_page: 1,
        path: '',
        per_page: 20,
        to: athletes.length || null,
        total,
      },
    });

  httpMock.expectOne('/api/v1/academy/classes').flush({ data: opts.classes ?? [] });

  httpMock
    .expectOne((r) => r.url === '/api/v1/attendance')
    .flush({ data: opts.presentRecords ?? [] });
}

/** An empty first page — the sort specs only care about the request. */
function emptyPage() {
  return {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: null,
      last_page: 1,
      path: '',
      per_page: 20,
      to: null,
      total: 0,
    },
  };
}

describe('DailyAttendanceComponent', () => {
  it('loads the academy roster and todays records on init', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges(); // triggers ngOnInit → loadDay()

    flushInit(httpMock, {
      athletes: [makeAthlete({ id: 1 }), makeAthlete({ id: 2, first_name: 'Luigi' })],
      presentRecords: [{ id: 100, athlete_id: 2, attended_on: '2026-04-24' }],
    });

    expect(component['athletes']().length).toBe(2);
    expect(component['isPresent'](1)).toBe(false);
    expect(component['isPresent'](2)).toBe(true);
    expect(component['loading']()).toBe(false);
  });

  it('never tells a roster longer than a page about a milestone (#1937)', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {
      athletes: Array.from({ length: 20 }, (_, i) => makeAthlete({ id: i + 1 })),
      meta: { total: 25 },
    });
    fixture.detectChanges();

    // The paginator already says where the other five are; the note that
    // used to sit under it named an internal milestone ("M4.2.5").
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.attendance__pagination-hint')).toBeNull();
    expect(page.textContent).not.toContain('M4.2.5');
  });

  it('tapping an unmarked athlete optimistically flips to present and POSTs', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })] });

    component['togglePresent'](makeAthlete({ id: 1 }));
    // Optimistic update is synchronous — present-map already shows the
    // sentinel record id (-1) before the server responds.
    expect(component['isPresent'](1)).toBe(true);
    expect(component['isInflight'](1)).toBe(true);

    const req = httpMock.expectOne('/api/v1/attendance');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.athlete_ids).toEqual([1]);
    req.flush({
      data: [
        {
          id: 42,
          athlete_id: 1,
          attended_on: '2026-04-24',
          notes: null,
          created_at: null,
          deleted_at: null,
        },
      ],
    });

    expect(component['isPresent'](1)).toBe(true);
    expect(component['isInflight'](1)).toBe(false);
  });

  it('tapping a marked athlete optimistically removes and DELETEs the record', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {
      athletes: [makeAthlete({ id: 1 })],
      presentRecords: [{ id: 50, athlete_id: 1, attended_on: '2026-04-24' }],
    });

    component['togglePresent'](makeAthlete({ id: 1 }));
    expect(component['isPresent'](1)).toBe(false); // optimistic
    expect(component['isInflight'](1)).toBe(true);

    const req = httpMock.expectOne('/api/v1/attendance/50');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(component['isPresent'](1)).toBe(false);
    expect(component['isInflight'](1)).toBe(false);
  });

  it('rolls back the optimistic mark on a server error and surfaces a failure toast', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })] });

    component['togglePresent'](makeAthlete({ id: 1 }));
    expect(component['isPresent'](1)).toBe(true); // optimistic

    httpMock
      .expectOne('/api/v1/attendance')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });

    // Rolled back.
    expect(component['isPresent'](1)).toBe(false);
    expect(component['isInflight'](1)).toBe(false);
  });

  it('rolls back the optimistic unmark on a server error', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {
      athletes: [makeAthlete({ id: 1 })],
      presentRecords: [{ id: 50, athlete_id: 1, attended_on: '2026-04-24' }],
    });

    component['togglePresent'](makeAthlete({ id: 1 }));
    expect(component['isPresent'](1)).toBe(false); // optimistic remove

    httpMock.expectOne('/api/v1/attendance/50').flush('boom', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Rolled back: athlete is present again, with the same record id.
    expect(component['isPresent'](1)).toBe(true);
    expect(component['isInflight'](1)).toBe(false);
  });

  it('ignores subsequent taps while a request for the same athlete is in flight', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })] });

    component['togglePresent'](makeAthlete({ id: 1 }));
    httpMock.expectOne('/api/v1/attendance'); // not flushed — still pending

    // Second tap should be ignored.
    component['togglePresent'](makeAthlete({ id: 1 }));

    // Still ONE pending request, no new POST/DELETE queued.
    httpMock.verify(); // would throw if a second request had been made
    httpMock.expectNone('/api/v1/attendance');
  });

  // ─── Training-days picker filter (#88c) ─────────────────────────────────────

  it('disables non-training weekdays in the date picker when training_days is configured', () => {
    const { fixture, component, httpMock } = setup();
    // Mon/Wed/Fri academy. The picker should grey out Sun, Tue, Thu, Sat.
    TestBed.inject(AcademyService).academy.set({
      ...ACADEMY_BASE,
      training_days: [1, 3, 5],
    });
    fixture.detectChanges();
    flushInit(httpMock, {});

    expect(component['disabledWeekdays']()).toEqual([0, 2, 4, 6]);
  });

  it('returns an empty disabled-weekdays list when training_days is unconfigured (legacy behaviour)', () => {
    const { fixture, component, httpMock } = setup();
    TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, training_days: null });
    fixture.detectChanges();
    flushInit(httpMock, {});

    // Empty array means PrimeNG's date picker leaves every weekday selectable
    // — same surface as before #88c, so nothing breaks for academies that
    // haven't opted in yet.
    expect(component['disabledWeekdays']()).toEqual([]);
  });

  // ─── Default-date selection (#195) ──────────────────────────────────────────
  // System time is pinned via vi.setSystemTime so `new Date()` inside the
  // component is deterministic across runs. 2026-04-29 is a Wednesday
  // (getDay() === 3), 2026-04-27 is the preceding Monday (getDay() === 1).
  //
  // Construction uses `new Date(2026, 3, 29)` (local) instead of
  // `new Date('2026-04-29')` (UTC per ECMA-262 §21.4.3.2): the date-only
  // string form is parsed in UTC, which makes `toDateString()` shift by a
  // day when the test runner sits in a non-UTC timezone (#195 follow-up
  // to Copilot review).

  it('keeps today as the default date when today is a training day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1, 3, 5], // Mon/Wed/Fri — Wed is in the set
      });
      fixture.detectChanges();
      flushInit(httpMock, {});

      expect(component['selectedDate']().getDay()).toBe(3); // still Wednesday
      expect(component['selectedDate']().toDateString()).toBe(new Date(2026, 3, 29).toDateString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('reseats to the most recent past training day when today is not a training day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1], // only Monday — Wed is NOT in the set
      });
      fixture.detectChanges();
      flushInit(httpMock, {});

      // Walks back from Wed → Tue → Mon (2026-04-27) and stops there.
      expect(component['selectedDate']().getDay()).toBe(1);
      expect(component['selectedDate']().toDateString()).toBe(new Date(2026, 3, 27).toDateString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('walks back past a closure to the last session held, and says the academy is closed (#1766)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1, 3, 5],
        closures: [{ id: 1, starts_on: '2026-04-27', ends_on: '2026-04-29', label: 'Seminar' }],
      });
      fixture.detectChanges();
      flushInit(httpMock, {});
      fixture.detectChanges();

      // Wed 29 and Mon 27 are shut: the last session held is Fri 24.
      expect(component['selectedDate']().toDateString()).toBe(new Date(2026, 3, 24).toDateString());
      const banner = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="attendance-no-class-banner"]',
      );
      expect(banner?.textContent).toContain('closed today (Seminar)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps today as the default date when training_days is unconfigured (legacy)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, training_days: null });
      fixture.detectChanges();
      flushInit(httpMock, {});

      // No training-day filter → today is a valid default, fall through.
      expect(component['selectedDate']().toDateString()).toBe(new Date(2026, 3, 29).toDateString());
    } finally {
      vi.useRealTimers();
    }
  });

  // ─── Today-aware title + no-class banner (#854) ────────────────────────────
  // The page header used to render "Check-in di oggi" unconditionally, even
  // when initSelectedDate() reseated the date onto a past training day —
  // the user saw a roster labelled "oggi" that was actually from an earlier
  // session. Two new pieces of chrome cover the ambiguity:
  //   - `selectedDateIsToday()` toggles the title between the literal
  //     "today" string and a dated form.
  //   - `showNoClassToday()` lights up a banner ONLY when today itself is
  //     a no-class day AND the reseat ran. Manual past-date navigation
  //     (backfill) is silent — the title changes, the banner doesn't.

  it('selectedDateIsToday is true when today is a training day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1, 3, 5], // Wed is in
      });
      fixture.detectChanges();
      flushInit(httpMock, {});

      expect(component['selectedDateIsToday']()).toBe(true);
      expect(component['showNoClassToday']()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('selectedDateIsToday is false AND showNoClassToday is true when today is not a training day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1], // Mon only — Wed reseat to Mon
      });
      fixture.detectChanges();
      flushInit(httpMock, {});

      expect(component['selectedDateIsToday']()).toBe(false);
      // Banner lights up because today itself (Wed) is a no-class day, NOT
      // because the user navigated to a past date manually.
      expect(component['showNoClassToday']()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('selectedDateIsToday is false but showNoClassToday stays false when the user manually navigates to a past date on a normal training day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 10)); // Wed
    try {
      const { fixture, component, httpMock } = setup();
      TestBed.inject(AcademyService).academy.set({
        ...ACADEMY_BASE,
        training_days: [1, 3, 5], // Wed is in — today IS a class day
      });
      fixture.detectChanges();
      flushInit(httpMock, {});

      // Simulate the user manually picking Mon (2026-04-27) via the date picker.
      component['selectedDate'].set(new Date(2026, 3, 27));

      expect(component['selectedDateIsToday']()).toBe(false);
      // No banner — the backfill case is silent; only the title is dated.
      expect(component['showNoClassToday']()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // ─── Filter strip (#184) ────────────────────────────────────────────────────
  // Search input + belt select forward to the same paginated athletes
  // endpoint that backs the page. Filter changes re-trigger loadDay()
  // so the daily roster reflects the new query.

  it('forwards searchTerm.q to the athletes endpoint when applySearch runs', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['applySearch']('mario');

    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('q') === 'mario')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });
    // Filter/sort changes route through `loadAthletes()` (not loadDay) so
    // the attendance endpoint is NOT re-hit — keeps an in-flight optimistic
    // mark from being clobbered by a parallel attendance refetch.
    httpMock.expectNone((r) => r.url === '/api/v1/attendance');

    expect(component['searchTerm']()).toBe('mario');
  });

  it('trims whitespace-only searchTerm to empty before forwarding (omits q)', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['applySearch']('   ');

    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('q') === null)
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });
    // Filter/sort changes route through `loadAthletes()` (not loadDay) so
    // the attendance endpoint is NOT re-hit — keeps an in-flight optimistic
    // mark from being clobbered by a parallel attendance refetch.
    httpMock.expectNone((r) => r.url === '/api/v1/attendance');

    expect(component['searchTerm']()).toBe('');
  });

  it('forwards belt filter to the athletes endpoint when onBeltChange runs', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['onBeltChange']('blue');

    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('belt') === 'blue')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });
    // Filter/sort changes route through `loadAthletes()` (not loadDay) so
    // the attendance endpoint is NOT re-hit — keeps an in-flight optimistic
    // mark from being clobbered by a parallel attendance refetch.
    httpMock.expectNone((r) => r.url === '/api/v1/attendance');

    expect(component['selectedBelt']()).toBe('blue');
  });

  it('says how many are present, and says nothing before anyone arrives (#1539)', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {
      athletes: [makeAthlete({ id: 1 }), makeAthlete({ id: 2, first_name: 'Luigi' })],
    });

    // An empty mat is not information — the chip is absent, not "0 present".
    expect(component['presentCountLabel']()).toBeNull();

    component['togglePresent'](makeAthlete({ id: 1 }));
    expect(component['presentCountLabel']()).toBe('1 present');

    component['togglePresent'](makeAthlete({ id: 2, first_name: 'Luigi' }));
    expect(component['presentCountLabel']()).toBe('2 present');

    // ...and it follows a correction back down, because it reads the same map
    // every row reads.
    httpMock
      .match((r) => r.url === '/api/v1/attendance')
      .forEach((req) =>
        req.flush({ data: [{ id: 99, athlete_id: 1, attended_on: '2026-04-24' }] }),
      );
    component['optimisticRemove'](2);
    expect(component['presentCountLabel']()).toBe('1 present');
  });

  it('opens on belt, highest rank first — the order the roster opens on', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();

    httpMock.expectOne(
      (r) =>
        r.url === '/api/v1/athletes' &&
        r.params.get('sort_by') === 'belt' &&
        r.params.get('sort_order') === 'desc',
    );
  });

  it('cycles the name header first asc → first desc → last asc → last desc', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    const expectSort = (field: string, order: string): void => {
      expect(component['sortField']()).toBe(field);
      expect(component['sortOrder']()).toBe(order);
      httpMock
        .expectOne(
          (r) =>
            r.url === '/api/v1/athletes' &&
            r.params.get('sort_by') === field &&
            r.params.get('sort_order') === order,
        )
        .flush(emptyPage());
      // Filter/sort changes route through `loadAthletes()` (not loadDay) so
      // the attendance endpoint is NOT re-hit — keeps an in-flight optimistic
      // mark from being clobbered by a parallel attendance refetch.
      httpMock.expectNone((r) => r.url === '/api/v1/attendance');
    };

    // Arriving from the belt default, the cycle restarts at first asc.
    component['cycleFullNameSort']();
    expectSort('first_name', 'asc');

    component['cycleFullNameSort']();
    expectSort('first_name', 'desc');

    component['cycleFullNameSort']();
    expectSort('last_name', 'asc');

    component['cycleFullNameSort']();
    expectSort('last_name', 'desc');
  });

  it('the name header signifier says which name leads, and goes neutral off a name sort', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    // Belt is the default, so the header starts neutral.
    expect(component['fullNameSortLabel']()).toBeNull();
    expect(component['fullNameAriaSort']()).toBe('none');

    component['cycleFullNameSort']();
    httpMock.match((r) => r.url === '/api/v1/athletes')[0].flush(emptyPage());
    expect(component['fullNameSortLabel']()).toBe('F↑');
    expect(component['fullNameAriaSort']()).toBe('ascending');

    component['cycleBeltSort']();
    httpMock.match((r) => r.url === '/api/v1/athletes')[0].flush(emptyPage());
    expect(component['fullNameSortLabel']()).toBeNull();
    expect(component['fullNameAriaSort']()).toBe('none');
  });

  it('the belt control flips direction and never turns the sort off', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['cycleBeltSort']();
    expect(component['sortField']()).toBe('belt');
    expect(component['sortOrder']()).toBe('asc');
    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('sort_by') === 'belt' &&
          r.params.get('sort_order') === 'asc',
      )
      .flush(emptyPage());

    component['cycleBeltSort']();
    expect(component['sortField']()).toBe('belt');
    expect(component['sortOrder']()).toBe('desc');
    httpMock.match((r) => r.url === '/api/v1/athletes')[0].flush(emptyPage());
  });

  // ─── Pagination (#527) ─────────────────────────────────────────────────────
  // Daily attendance reuses the SAME paginated /api/v1/athletes endpoint as
  // athletes-list, so it must walk the same pagination path. Without it,
  // sorting a roster of > 20 athletes by belt rank pinned the user to page 1
  // — the entire blue+ tier silently disappeared because the first 20 rows
  // were exhausted by white belts (Luigi's bug report).

  it('forwards page=N to the athletes endpoint when onPageChange runs', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    // PrimeNG's <p-table> emits {first, rows} on (onPage). first=20 + rows=20
    // means "page 2" in 1-indexed terms.
    component['onPageChange']({ first: 20, rows: 20 });

    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('page') === '2')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 2,
          from: null,
          last_page: 2,
          path: '',
          per_page: 20,
          to: null,
          total: 25,
        },
      });
    // Pagination is roster-only — attendance records for the date are
    // unchanged across pages, so no /api/v1/attendance re-hit.
    httpMock.expectNone((r) => r.url === '/api/v1/attendance');

    expect(component['first']()).toBe(20);
  });

  it('resets to page 1 when the search term changes', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    // Land on page 3 first.
    component['onPageChange']({ first: 40, rows: 20 });
    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('page') === '3')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 3,
          from: null,
          last_page: 3,
          path: '',
          per_page: 20,
          to: null,
          total: 50,
        },
      });

    // Now searching should bounce back to page 1 — otherwise a filter that
    // matches fewer than 41 rows leaves us on an empty phantom page.
    component['applySearch']('mario');

    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('q') === 'mario' &&
          // Page 1 is the implicit default — the service omits the param when
          // page === 1, so we assert the absence of the `page` query param.
          r.params.get('page') === null,
      )
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });

    expect(component['first']()).toBe(0);
  });

  it('resets to page 1 when the belt filter changes', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['onPageChange']({ first: 40, rows: 20 });
    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('page') === '3')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 3,
          from: null,
          last_page: 3,
          path: '',
          per_page: 20,
          to: null,
          total: 50,
        },
      });

    component['onBeltChange']('blue');

    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('belt') === 'blue' &&
          r.params.get('page') === null,
      )
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });

    expect(component['first']()).toBe(0);
  });

  it('resets to page 1 when the sort header is clicked (the bug)', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['onPageChange']({ first: 40, rows: 20 });
    httpMock
      .expectOne((r) => r.url === '/api/v1/athletes' && r.params.get('page') === '3')
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 3,
          from: null,
          last_page: 3,
          path: '',
          per_page: 20,
          to: null,
          total: 50,
        },
      });

    // Belt sort from page 3 must bounce to page 1 — otherwise a sort that
    // changes the row order leaves us on a stale slice.
    component['cycleBeltSort']();

    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('sort_by') === 'belt' &&
          r.params.get('sort_order') === 'asc' &&
          r.params.get('page') === null,
      )
      .flush({
        data: [],
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          from: null,
          last_page: 1,
          path: '',
          per_page: 20,
          to: null,
          total: 0,
        },
      });

    expect(component['first']()).toBe(0);
  });

  it('mobile filter sheet hosts the same Belt control and resetFilters clears the signal (#711)', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })] });

    // Both rows are rendered in the template — mobile/desktop visibility
    // is media-query driven, not Angular-conditional.
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-cy="attendance-filters-inline"]')).toBeTruthy();
    expect(el.querySelector('[data-cy="attendance-filters-sheet"]')).toBeTruthy();

    // Set a filter to verify resetFilters() flips it back.
    component['selectedBelt'].set('blue');
    expect(component['activeFilterCount']()).toBe(1);

    component['resetFilters']();
    expect(component['selectedBelt']()).toBe('');
    expect(component['activeFilterCount']()).toBe(0);

    // resetFilters() reloads athletes — drain the request so the
    // afterEach `verify()` stays clean.
    httpMock.expectOne((req) => req.url === '/api/v1/athletes').flush({ data: [], meta: {} });
  });

  describe('classes (#1562)', () => {
    function klass(overrides: Partial<AcademyClass> & { id: number }): AcademyClass {
      return {
        name: `Class ${overrides.id}`,
        weekday: 1,
        starts_at: '19:00',
        duration_minutes: 60,
        kind: 'gi',
        ...overrides,
      };
    }

    // Monday: kids at 17:00, fundamentals at 19:00. Advanced is on Wednesday.
    const KIDS = klass({ id: 1, name: 'Kids', weekday: 1, starts_at: '17:00' });
    const FUNDAMENTALS = klass({ id: 2, name: 'Fundamentals', weekday: 1, starts_at: '19:00' });
    const ADVANCED = klass({ id: 3, name: 'Advanced', weekday: 3, starts_at: '19:00' });

    beforeEach(() => {
      vi.useFakeTimers();
      // Monday 14 September 2026, half an hour before fundamentals.
      vi.setSystemTime(new Date(2026, 8, 14, 18, 30));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Roster and timetable flushed; the attendance request is handed back unflushed. */
    function flushUpToAttendance(httpMock: HttpTestingController, classes: AcademyClass[]) {
      httpMock.expectOne((r) => r.url === '/api/v1/athletes').flush(emptyPage());
      httpMock.expectOne('/api/v1/academy/classes').flush({ data: classes });
      return httpMock.expectOne((r) => r.url === '/api/v1/attendance');
    }

    it("offers the day's classes as chips, the one the clock points at already on", () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      const req = flushUpToAttendance(httpMock, [KIDS, FUNDAMENTALS, ADVANCED]);

      // 18:30 on a Monday: fundamentals at 19:00 is the nearest start.
      expect(component['selectedClassId']()).toBe(FUNDAMENTALS.id);
      expect(req.request.params.get('academy_class_id')).toBe('2');
      req.flush({ data: [] });
      fixture.detectChanges();

      const chips = fixture.nativeElement.querySelectorAll(
        '.class-chip',
      ) as NodeListOf<HTMLButtonElement>;
      // Wednesday's class is not today's.
      expect(chips.length).toBe(2);
      expect(chips[0].getAttribute('aria-checked')).toBe('false');
      expect(chips[1].getAttribute('aria-checked')).toBe('true');
      expect(chips[1].getAttribute('role')).toBe('radio');
    });

    it('ignores a row tap before the timetable has answered — a mark must know its class', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/api/v1/athletes').flush(emptyPage());

      // The roster is on screen, the classes are not back yet.
      component['togglePresent'](makeAthlete({ id: 1 }));

      httpMock.expectNone((r) => r.url === '/api/v1/attendance' && r.method === 'POST');
      expect(component['isPresent'](1)).toBe(false);

      httpMock.expectOne('/api/v1/academy/classes').flush({ data: [KIDS, FUNDAMENTALS] });
      httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });
      expect(component['loading']()).toBe(false);
    });

    it('ignores a chip tap while the day is still loading', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      // The timetable answers first; the roster is still in flight.
      httpMock.expectOne('/api/v1/academy/classes').flush({ data: [KIDS, FUNDAMENTALS] });
      const records = httpMock.expectOne((r) => r.url === '/api/v1/attendance');

      component['selectClass'](KIDS.id);

      expect(component['selectedClassId']()).toBe(FUNDAMENTALS.id);
      records.flush({ data: [] });
      httpMock
        .expectOne((r) => r.url === '/api/v1/athletes')
        .flush({
          data: [makeAthlete({ id: 1 })],
          links: { first: null, last: null, prev: null, next: null },
          meta: { current_page: 1, from: 1, last_page: 1, path: '', per_page: 20, to: 1, total: 1 },
        });
      expect(component['athletes']().length).toBe(1);
      expect(component['loading']()).toBe(false);
    });

    it('does not drop the records when the roster reloads while they are in flight', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });

      component['selectClass'](KIDS.id);
      const records = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      // A search keystroke: roster-only reload, while the records are loading.
      component['applySearch']('mar');
      const roster = httpMock.expectOne((r) => r.url === '/api/v1/athletes');

      records.flush({ data: [{ id: 5, athlete_id: 1, lesson_id: 3, attended_on: '2026-09-14' }] });
      roster.flush(emptyPage());

      // The two fetches answer two different questions; one must not
      // invalidate the other.
      expect(component['isPresent'](1)).toBe(true);
      expect(component['loading']()).toBe(false);
    });

    it('sends the selected class with every mark', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })], classes: [KIDS, FUNDAMENTALS] });

      component['togglePresent'](makeAthlete({ id: 1 }));

      const req = httpMock.expectOne('/api/v1/attendance');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        date: '2026-09-14',
        athlete_ids: [1],
        academy_class_id: FUNDAMENTALS.id,
      });
      req.flush({ data: [{ id: 9, athlete_id: 1, lesson_id: 5, attended_on: '2026-09-14' }] });
    });

    it('re-reads the records — and only the records — when another chip is tapped', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });

      component['selectClass'](KIDS.id);

      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      expect(req.request.params.get('academy_class_id')).toBe('1');
      httpMock.expectNone((r) => r.url === '/api/v1/athletes');
      req.flush({ data: [] });
      expect(component['selectedClassId']()).toBe(KIDS.id);
    });

    it('names the class instead of asking when the day has exactly one', () => {
      const { fixture, httpMock } = setup();
      fixture.detectChanges();
      const req = flushUpToAttendance(httpMock, [FUNDAMENTALS, ADVANCED]);
      expect(req.request.params.get('academy_class_id')).toBe('2');
      req.flush({ data: [] });
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.class-chip')).toBeNull();
      expect(el.querySelector('[data-cy="attendance-class-single"]')?.textContent).toContain(
        'Fundamentals · 19:00',
      );
    });

    it('marks by the day, as before, when the date has no class', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      const req = flushUpToAttendance(httpMock, [ADVANCED]);
      expect(req.request.params.has('academy_class_id')).toBe(false);
      req.flush({ data: [] });
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-cy="attendance-class-picker"]')).toBeNull();
      expect(el.querySelector('[data-cy="attendance-class-single"]')).toBeNull();

      component['togglePresent'](makeAthlete({ id: 1 }));
      const post = httpMock.expectOne('/api/v1/attendance');
      expect(post.request.body).toEqual({ date: '2026-09-14', athlete_ids: [1] });
      post.flush({ data: [{ id: 9, athlete_id: 1, lesson_id: null, attended_on: '2026-09-14' }] });
    });

    it('keeps the day when the picker reports an unparsable field (#1638)', () => {
      // `<p-datepicker>` reports null for anything its parser rejects: an
      // emptied field, and every half-typed date on the way to a whole one.
      // It used to go straight into a signal typed `Date`, and `dayClasses`
      // then read `.getDay()` on null once per change-detection pass. The
      // harness caught it at `30-attendance-date-cleared`.
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS, ADVANCED] });
      const before = component['selectedDate']();

      component['onDateChanged'](null);
      fixture.detectChanges();

      expect(component['selectedDate']().getTime()).toBe(before.getTime());
      expect(() => component['dayClasses']()).not.toThrow();
      httpMock.expectNone((r) => r.url === '/api/v1/attendance');
    });

    it('puts the day back in the field on the way out, with a fresh reference (#1638)', async () => {
      // The first fix wrote the date back on *every* null, which restored
      // the old text under the cursor and made a date impossible to type by
      // hand. Restoring belongs on blur — and it has to be a new `Date`:
      // the same instance leaves `ngModel` with nothing to re-render, and
      // the field would stay empty for good.
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS, ADVANCED] });
      const before = component['selectedDate']();

      const input = fixture.nativeElement.querySelector(
        '[data-cy="attendance-date"] input',
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      input.value = '';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();

      component['restoreDateDisplay']();
      fixture.detectChanges();
      await fixture.whenStable();

      const after = component['selectedDate']();
      expect(after.getTime()).toBe(before.getTime());
      expect(after).not.toBe(before);
      expect(input.value).not.toBe('');
    });

    it('re-picks the class when the date moves — a past day opens on its first class', () => {
      // Wednesday evening, backfilling Monday.
      vi.setSystemTime(new Date(2026, 8, 16, 18, 30));
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS, ADVANCED] });
      expect(component['selectedClassId']()).toBe(ADVANCED.id);

      component['onDateChanged'](new Date(2026, 8, 14));

      httpMock.expectOne((r) => r.url === '/api/v1/athletes').flush(emptyPage());
      // The timetable is not re-read: it was loaded once for the visit.
      httpMock.expectNone('/api/v1/academy/classes');
      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      // Kids, the first of Monday — the clock says nothing about last Monday.
      expect(req.request.params.get('academy_class_id')).toBe('1');
      req.flush({ data: [] });
    });

    it('ignores a chip tap while a mark is in flight', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();
      flushInit(httpMock, { athletes: [makeAthlete({ id: 1 })], classes: [KIDS, FUNDAMENTALS] });

      component['togglePresent'](makeAthlete({ id: 1 })); // POST pending
      component['selectClass'](KIDS.id);

      expect(component['selectedClassId']()).toBe(FUNDAMENTALS.id);
      httpMock.expectNone((r) => r.url === '/api/v1/attendance' && r.method === 'GET');
      httpMock
        .expectOne((r) => r.url === '/api/v1/attendance' && r.method === 'POST')
        .flush({ data: [] });
    });

    it('keeps the page whole when the timetable cannot be loaded, and marks by the day', () => {
      const { fixture, component, httpMock } = setup();
      fixture.detectChanges();

      httpMock.expectOne((r) => r.url === '/api/v1/athletes').flush(emptyPage());
      httpMock
        .expectOne('/api/v1/academy/classes')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      expect(req.request.params.has('academy_class_id')).toBe(false);
      req.flush({ data: [] });

      expect(component['loading']()).toBe(false);
      expect(component['dayClasses']()).toEqual([]);
    });
  });
});

describe('DailyAttendanceComponent — what the lesson covered (#1564)', () => {
  const KIDS = {
    id: 1,
    name: 'Kids',
    weekday: new Date().getDay(),
    starts_at: null,
    duration_minutes: null,
    kind: 'gi' as const,
  };

  /** The day load now also reads the slot's lesson, once a class is picked. */
  function flushLesson(httpMock: HttpTestingController, lesson: unknown): void {
    httpMock
      .expectOne((r) => r.url === '/api/v1/lessons' && r.method === 'GET')
      .flush({ data: lesson });
  }

  it('shows no topic row without a class — there is no lesson to hang topics off', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-cy="attendance-topics"]')).toBeNull();
  });

  it('invites a first tag when the lesson carries none', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS] });
    flushLesson(httpMock, null);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-cy="attendance-topics"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Nothing tagged yet');
    expect(row.textContent).toContain('Add topics');
  });

  it('shows each topic as its own chip, with the position it belongs to', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS] });
    flushLesson(httpMock, {
      id: 5,
      academy_class_id: 1,
      held_on: '2026-09-14',
      name: 'Kids',
      starts_at: null,
      kind: 'gi',
      notes: null,
      held: true,
      topics: [
        {
          id: 11,
          name: 'Armbar',
          kind: 'both',
          parent_id: 1,
          parent_name: 'Closed guard',
          deleted: false,
        },
        {
          id: 12,
          name: 'Triangle',
          kind: 'both',
          parent_id: 1,
          parent_name: 'Closed guard',
          deleted: false,
        },
      ],
    });
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-cy="attendance-topics"]') as HTMLElement;

    // One chip each, not one line joined with ` · ` (#1657). A middle dot is
    // not a boundary the eye trusts, and the payload's `parent_name` was
    // being thrown away by the join — so a technique sat beside its own
    // position looking like a separate technique.
    const chips = row.querySelectorAll('.chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain('Armbar');
    expect(chips[0].textContent).toContain('Closed guard');
    expect(chips[1].textContent).toContain('Triangle');
    expect(row.textContent).not.toContain('·');

    expect(row.textContent).toContain('Edit');
  });

  it('opens the sheet from the row', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS] });
    flushLesson(httpMock, null);
    fixture.detectChanges();

    expect(component['lessonSheetOpen']()).toBe(false);
    (
      fixture.nativeElement.querySelector('[data-cy="attendance-topics"]') as HTMLButtonElement
    ).click();
    expect(component['lessonSheetOpen']()).toBe(true);
  });

  // ─── Check-in polish (#1657) ─────────────────────────────────────────────

  it('draws the state as a square that leads the row, never as a radio circle', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS], athletes: [makeAthlete({ id: 1 })] });
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-cy^="attendance-row-"]') as HTMLElement;
    expect(row, 'a roster row').not.toBeNull();
    // First cell, not last: "is this person ticked?" should not be a saccade
    // across the row (CHK-1).
    const first = row.querySelector('td');
    expect(first?.classList.contains('attendance-cell-indicator')).toBe(true);
    // A radio circle reads as "pick exactly one" on a list whose whole job is
    // ticking many. #1686 fixed the lesson sheet; the check-in was missed.
    expect(row.querySelector('.pi-circle, .pi-check-circle')).toBeNull();
    expect(row.querySelector('.pi-stop, .pi-check-square')).not.toBeNull();
  });

  it('links the empty roster to the page that fixes it', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS], athletes: [] });
    fixture.detectChanges();

    // "Add one from the Athletes page" named a destination with no way to
    // reach it (CHK-5).
    const link = fixture.nativeElement.querySelector('[data-cy="attendance-empty-athletes-link"]');
    expect(link?.getAttribute('href')).toBe('/dashboard/athletes');
  });
});

describe('DailyAttendanceComponent — who usually comes and is not here (#1730)', () => {
  // Monday: kids at 17:00, fundamentals at 19:00 — the clock picks fundamentals.
  const KIDS: AcademyClass = {
    id: 1,
    name: 'Kids',
    weekday: 1,
    starts_at: '17:00',
    duration_minutes: 60,
    kind: 'gi',
  };
  const FUNDAMENTALS: AcademyClass = { ...KIDS, id: 2, name: 'Fundamentals', starts_at: '19:00' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 18, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function regular(id: number) {
    return {
      id,
      first_name: 'Athlete',
      last_name: `N${id}`,
      belt: 'blue',
      stripes: 0,
      date_of_birth: null,
      photo_url: null,
      user_avatar_url: null,
      phone_country_code: '+39',
      phone_national_number: '3471234567',
      attended: 4,
      last_attended_on: '2026-09-07',
    };
  }

  function answer(ids: number[]) {
    return {
      data: ids.map(regular),
      meta: {
        occurrences: 4,
        occurrence_dates: ['2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17'],
      },
    };
  }

  function regularsRequests(httpMock: HttpTestingController) {
    return httpMock.match((r) => r.url === '/api/v1/attendance/regulars');
  }

  function missingIds(fixture: Harness['fixture']): string[] {
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-cy="missing-regulars-toggle"]')?.click();
    fixture.detectChanges();
    return Array.from(root.querySelectorAll('[data-cy^="missing-regular-"]')).map(
      (el) => el.getAttribute('data-cy') ?? '',
    );
  }

  it('asks once for the selected class and day, when the day loads', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });

    const requests = regularsRequests(httpMock);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.params.get('date')).toBe('2026-09-14');
    expect(requests[0].request.params.get('academy_class_id')).toBe('2');
  });

  it('does not ask, and draws nothing, when there is no class to ask about', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [] });
    fixture.detectChanges();

    expect(regularsRequests(httpMock)).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('app-missing-regulars')).toBeNull();
  });

  it('lists the regulars who are not ticked, and drops one the moment they are — without asking again', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {
      athletes: [makeAthlete({ id: 7 })],
      classes: [KIDS, FUNDAMENTALS],
      presentRecords: [{ id: 100, athlete_id: 8, attended_on: '2026-09-14' }],
    });
    regularsRequests(httpMock)[0].flush(answer([7, 8, 9]));

    expect(missingIds(fixture)).toEqual(['missing-regular-7', 'missing-regular-9']);

    component['togglePresent'](makeAthlete({ id: 7 }));
    fixture.detectChanges();

    expect(
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('[data-cy^="missing-regular-"]'),
      ).map((el) => el.getAttribute('data-cy')),
    ).toEqual(['missing-regular-9']);
    // The tap is a mark, not a reason to re-read the class's history.
    expect(regularsRequests(httpMock)).toHaveLength(0);
    httpMock
      .expectOne((r) => r.url === '/api/v1/attendance' && r.method === 'POST')
      .flush({ data: [{ id: 501, athlete_id: 7, lesson_id: 3, attended_on: '2026-09-14' }] });
  });

  it('asks again for the other class when another chip is tapped', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });
    regularsRequests(httpMock)[0].flush(answer([7]));

    component['selectClass'](KIDS.id);
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });

    const again = regularsRequests(httpMock);
    expect(again).toHaveLength(1);
    expect(again[0].request.params.get('academy_class_id')).toBe('1');
  });

  it('checks a regular in from the panel, through the same mark, and the row leaves it (#1930)', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { athletes: [], classes: [KIDS, FUNDAMENTALS] });
    regularsRequests(httpMock)[0].flush(answer([7, 9]));
    missingIds(fixture);

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLElement>('[data-cy="missing-present-9"] button')?.click();
    fixture.detectChanges();

    // Not on this page of the register, and still marked: the panel is the
    // list of who is about to walk in, whatever the search above shows.
    const post = httpMock.expectOne((r) => r.url === '/api/v1/attendance' && r.method === 'POST');
    expect(post.request.body).toEqual({
      date: '2026-09-14',
      athlete_ids: [9],
      academy_class_id: FUNDAMENTALS.id,
    });
    expect(
      Array.from(root.querySelectorAll('[data-cy^="missing-regular-"]')).map((el) =>
        el.getAttribute('data-cy'),
      ),
    ).toEqual(['missing-regular-7']);
    post.flush({ data: [{ id: 502, athlete_id: 9, lesson_id: 3, attended_on: '2026-09-14' }] });
  });

  it('never lets a slow answer for the previous class land over the current one', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });
    const slow = regularsRequests(httpMock)[0];

    component['selectClass'](KIDS.id);
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });
    const current = regularsRequests(httpMock)[0];

    current.flush(answer([9]));
    // Fundamentals answers last, long after the owner moved on to kids.
    slow.flush(answer([7, 8]));

    expect(missingIds(fixture)).toEqual(['missing-regular-9']);
  });

  it('waits for the room before counting who is missing', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/api/v1/athletes').flush(emptyPage());
    httpMock.expectOne('/api/v1/academy/classes').flush({ data: [KIDS, FUNDAMENTALS] });
    const records = httpMock.expectOne((r) => r.url === '/api/v1/attendance');

    // The regulars answer first: with nobody known on the mat yet, all three
    // would read as missing.
    regularsRequests(httpMock)[0].flush(answer([7, 8, 9]));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="missing-regulars-toggle"]')).toBeNull();

    records.flush({ data: [{ id: 100, athlete_id: 8, lesson_id: 3, attended_on: '2026-09-14' }] });

    expect(missingIds(fixture)).toEqual(['missing-regular-7', 'missing-regular-9']);
  });

  it('says so when the answer fails, and asks again on retry', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, { classes: [KIDS, FUNDAMENTALS] });
    regularsRequests(httpMock)[0].flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-cy="missing-regulars-error"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-cy="missing-regulars-retry"]')?.click();
    regularsRequests(httpMock)[0].flush(answer([7]));
    fixture.detectChanges();

    expect(root.querySelector('[data-cy="missing-regulars-error"]')).toBeNull();
    expect(root.querySelector('[data-cy="missing-regulars-toggle"]')).not.toBeNull();
  });
});

describe('DailyAttendanceComponent — type a name and press Enter (#1930)', () => {
  const GALLO = makeAthlete({ id: 7, first_name: 'Andrea', last_name: 'Gallo' });
  const GALLI = makeAthlete({ id: 8, first_name: 'Marta', last_name: 'Galli' });

  function page(athletes: Athlete[]) {
    return {
      data: athletes,
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: 1,
        from: athletes.length ? 1 : null,
        last_page: 1,
        path: '',
        per_page: 20,
        to: athletes.length || null,
        total: athletes.length,
      },
    };
  }

  /** Types into the search box the way a keyboard does. */
  function type(fixture: Harness['fixture'], text: string): HTMLInputElement {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-cy="attendance-search-input"]',
    )!;
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  }

  function press(input: HTMLInputElement, key: 'Enter' | 'Escape'): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function roster(httpMock: HttpTestingController, q: string | null) {
    return httpMock.expectOne(
      (r) =>
        r.url === '/api/v1/athletes' &&
        r.method === 'GET' &&
        (q === null ? !r.params.has('q') : r.params.get('q') === q),
    );
  }

  function marks(httpMock: HttpTestingController) {
    return httpMock.match((r) => r.url === '/api/v1/attendance' && r.method === 'POST');
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function ready(): Harness {
    const harness = setup();
    harness.fixture.detectChanges();
    flushInit(harness.httpMock, { athletes: [GALLO, GALLI] });
    harness.fixture.detectChanges();
    return harness;
  }

  it('marks the one match present, empties the box and keeps the cursor there', () => {
    const { fixture, component, httpMock } = ready();
    const input = type(fixture, 'gallo');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'gallo').flush(page([GALLO]));
    fixture.detectChanges();

    press(input, 'Enter');
    fixture.detectChanges();

    const [post] = marks(httpMock);
    expect(post.request.body.athlete_ids).toEqual([7]);
    expect(component['isPresent'](7)).toBe(true);
    // The box is ready for the next name, and the whole register is back.
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    roster(httpMock, null).flush(page([GALLO, GALLI]));
    post.flush({ data: [{ id: 900, athlete_id: 7, attended_on: '2026-09-14' }] });
  });

  it('searches at once when Enter beats the typing pause, and the pause does not search again', () => {
    const { fixture, httpMock } = ready();
    const input = type(fixture, 'gallo');
    press(input, 'Enter'); // well inside the 200 ms pause

    // The pause runs out while that search is still on the way. Asking again
    // would supersede it, and its answer would then mark nobody.
    vi.advanceTimersByTime(250);
    const searches = httpMock.match(
      (r) => r.url === '/api/v1/athletes' && r.params.get('q') === 'gallo',
    );
    expect(searches).toHaveLength(1);

    searches[0].flush(page([GALLO]));
    fixture.detectChanges();

    const [post] = marks(httpMock);
    expect(post.request.body.athlete_ids).toEqual([7]);
    expect(input.value).toBe('');
    roster(httpMock, null).flush(page([GALLO, GALLI]));
    post.flush({ data: [{ id: 900, athlete_id: 7, attended_on: '2026-09-14' }] });

    // Nor does the emptied box, once its own pause runs out.
    vi.advanceTimersByTime(250);
    httpMock.verify();
  });

  it('never marks the name on screen after the search for another name failed', () => {
    const { fixture, component, httpMock } = ready();
    const input = type(fixture, 'gallo');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'gallo').flush(page([GALLO]));
    fixture.detectChanges();

    // "galli" and Enter: that search fails, and Andrea Gallo stays on screen.
    input.value = 'galli';
    input.dispatchEvent(new Event('input'));
    press(input, 'Enter');
    roster(httpMock, 'galli').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component['athletes']().map((a) => a.id)).toEqual([7]);

    // Enter again asks again. It never marks the one name the list still shows.
    press(input, 'Enter');
    expect(marks(httpMock)).toHaveLength(0);
    roster(httpMock, 'galli').flush(page([GALLI]));
    fixture.detectChanges();

    const [post] = marks(httpMock);
    expect(post.request.body.athlete_ids).toEqual([8]);
    expect(component['isPresent'](7)).toBe(false);
    roster(httpMock, null).flush(page([GALLO, GALLI]));
    post.flush({ data: [{ id: 901, athlete_id: 8, attended_on: '2026-09-14' }] });
  });

  it('marks nobody when the name matches two people, or none', () => {
    const { fixture, httpMock } = ready();
    const input = type(fixture, 'gall');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'gall').flush(page([GALLO, GALLI]));
    fixture.detectChanges();

    press(input, 'Enter');
    expect(marks(httpMock)).toHaveLength(0);
    expect(input.value).toBe('gall');

    type(fixture, 'zzz');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'zzz').flush(page([]));
    fixture.detectChanges();

    press(input, 'Enter');
    expect(marks(httpMock)).toHaveLength(0);
  });

  it('never takes someone off the mat: Enter on a person already present does nothing', () => {
    const { fixture, component, httpMock } = ready();
    component['togglePresent'](GALLO);
    marks(httpMock)[0].flush({ data: [{ id: 900, athlete_id: 7, attended_on: '2026-09-14' }] });

    const input = type(fixture, 'gallo');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'gallo').flush(page([GALLO]));
    fixture.detectChanges();

    press(input, 'Enter');
    httpMock.expectNone((r) => r.method === 'DELETE');
    expect(marks(httpMock)).toHaveLength(0);
    expect(component['isPresent'](7)).toBe(true);
  });

  it('marks nobody when the name was changed while its search was on the way', () => {
    const { fixture, httpMock } = ready();
    const input = type(fixture, 'gallo');
    press(input, 'Enter');

    input.value = 'gallo m'; // still typing
    roster(httpMock, 'gallo').flush(page([GALLO]));
    fixture.detectChanges();

    expect(marks(httpMock)).toHaveLength(0);
  });

  it('clears the box and the search on Esc', () => {
    const { fixture, component, httpMock } = ready();
    const input = type(fixture, 'gallo');
    vi.advanceTimersByTime(250);
    roster(httpMock, 'gallo').flush(page([GALLO]));
    fixture.detectChanges();

    press(input, 'Escape');
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(component['searchTerm']()).toBe('');
    roster(httpMock, null).flush(page([GALLO, GALLI]));
  });
});
