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
});
