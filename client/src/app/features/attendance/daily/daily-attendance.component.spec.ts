import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AcademyService } from '../../../core/services/academy.service';
import { Athlete } from '../../../core/services/athlete.service';
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
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  const fixture = TestBed.createComponent(DailyAttendanceComponent);
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/** Settle both initial requests (athletes list + daily attendance). */
function flushInit(
  httpMock: HttpTestingController,
  opts: {
    athletes?: Athlete[];
    meta?: { total: number };
    presentRecords?: { id: number; athlete_id: number; attended_on: string }[];
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

  httpMock
    .expectOne((r) => r.url === '/api/v1/attendance')
    .flush({ data: opts.presentRecords ?? [] });
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
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });

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
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });

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
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });

    expect(component['selectedBelt']()).toBe('blue');
  });

  it('honors the sort allowlist and forwards sort_by + sort_order on header click', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['onSort']({ field: 'last_name', order: 1 });
    expect(component['sortField']()).toBe('last_name');
    expect(component['sortOrder']()).toBe('asc');

    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/athletes' &&
          r.params.get('sort_by') === 'last_name' &&
          r.params.get('sort_order') === 'asc',
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
    httpMock.expectOne((r) => r.url === '/api/v1/attendance').flush({ data: [] });
  });

  it('rejects fields outside the sort allowlist (e.g. created_at)', () => {
    const { fixture, component, httpMock } = setup();
    fixture.detectChanges();
    flushInit(httpMock, {});

    component['onSort']({ field: 'last_name', order: 1 });
    httpMock
      .match((r) => r.url === '/api/v1/athletes')[0]
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
    httpMock.match((r) => r.url === '/api/v1/attendance')[0].flush({ data: [] });

    component['onSort']({ field: 'created_at', order: -1 });
    // created_at is not in the daily-attendance allowlist (only the
    // first/last_name + belt sorts are surfaced) — sortField stays put.
    expect(component['sortField']()).toBe('last_name');
  });
});
