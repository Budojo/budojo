import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceHistoryComponent } from './attendance-history.component';
import { AcademyService } from '../../../../core/services/academy.service';
import { Athlete } from '../../../../core/services/athlete.service';
import { AttendanceRecord } from '../../../../core/services/attendance.service';

const ATHLETE_ID = 42;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    date_of_birth: null,
    belt: 'blue',
    stripes: 0,
    status: 'active',
    joined_at: '2026-01-15',
    created_at: '2026-01-15T10:00:00+00:00',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 1,
    athlete_id: ATHLETE_ID,
    attended_on: '2026-04-10',
    notes: null,
    created_at: '2026-04-10T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

function setupTestBed(): HttpTestingController {
  const parentParamMap = convertToParamMap({ id: String(ATHLETE_ID) });
  TestBed.configureTestingModule({
    imports: [AttendanceHistoryComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          parent: { paramMap: of(parentParamMap) },
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AttendanceHistoryComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 25));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the athlete and the current month of attendance records on init', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [makeRecord({ attended_on: '2026-04-10' })] });

    expect(fixture.componentInstance['attendedCount']()).toBe(1);
    expect(fixture.componentInstance['attendedDates']().has('2026-04-10')).toBe(true);
    httpMock.verify();
  });

  // ─── Training-days percentage (#106) ────────────────────────────────────────

  it('exposes scheduledCount + ratePercent when the academy has training_days configured', () => {
    const httpMock = setupTestBed();
    // System time is Apr 25 2026 (per beforeEach). Academy trains
    // Mon/Wed/Fri = [1, 3, 5]. April 2026: 1 (Wed), 3 (Fri), 6 (Mon),
    // 8 (Wed), 10 (Fri), 13 (Mon), 15 (Wed), 17 (Fri), 20 (Mon),
    // 22 (Wed), 24 (Fri) — 11 sessions through Apr 25 (a Saturday).
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [1, 3, 5],
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [
          makeRecord({ id: 1, attended_on: '2026-04-01' }),
          makeRecord({ id: 2, attended_on: '2026-04-08' }),
          makeRecord({ id: 3, attended_on: '2026-04-10' }),
          makeRecord({ id: 4, attended_on: '2026-04-15' }),
          makeRecord({ id: 5, attended_on: '2026-04-22' }),
        ],
      });

    expect(fixture.componentInstance['attendedCount']()).toBe(5);
    expect(fixture.componentInstance['scheduledCount']()).toBe(11);
    expect(fixture.componentInstance['ratePercent']()).toBe(45); // 5/11 = 0.4545 -> 45
    httpMock.verify();
  });

  it('returns scheduledCount=null when the academy has no training_days configured', () => {
    const httpMock = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: null,
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    // No academy schedule → no denominator → no percentage UI; the template
    // falls back to the raw count.
    expect(fixture.componentInstance['scheduledCount']()).toBeNull();
    expect(fixture.componentInstance['ratePercent']()).toBeNull();
    expect(fixture.componentInstance['progressBarWidth']()).toBeNull();
    httpMock.verify();
  });

  it('falls back to the raw count when scheduledCount is 0 (future month / pre-first-session)', () => {
    // Use a future month where the academy schedule has 0 sessions held yet.
    // System time is Apr 25 2026; visible defaults to current month — but
    // we'll stub the computed by setting a non-current visible state.
    const httpMock = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [3], // Wednesdays only
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });
    httpMock.verify();

    // Step the visible month FORWARD past today — now scheduledCount = 0.
    // Strictly: canGoNext is false for "current month", but for tests we
    // can directly poke the signal for behavior coverage.
    const component = fixture.componentInstance as unknown as {
      visible: { set: (v: { year: number; month: number }) => void };
      scheduledCount: () => number | null;
      ratePercent: () => number | null;
    };
    component.visible.set({ year: 2026, month: 6 });
    expect(component.scheduledCount()).toBe(0);
    // ratePercent is null when scheduled=0 → template renders fallback
    // "X days this month" instead of an ambiguous "X / 0 days · null%".
    expect(component.ratePercent()).toBeNull();
  });

  it('marks training-day cells with the --training modifier so non-training days read as not relevant (#88c)', () => {
    const httpMock = setupTestBed();
    // April 2026, system time Apr 25. Mon/Wed/Fri = [1, 3, 5].
    // Apr 1 is a Wednesday → training day; Apr 4 is a Saturday → not training.
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [1, 3, 5],
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });
    fixture.detectChanges();

    // Apr 1 (Wednesday → in training_days)
    const aprilFirst = fixture.nativeElement.querySelector('[data-day="1"]') as HTMLElement | null;
    expect(aprilFirst).not.toBeNull();
    expect(aprilFirst!.classList.contains('attendance-history__cell--training')).toBe(true);

    // Apr 4 (Saturday → NOT in training_days)
    const aprilFourth = fixture.nativeElement.querySelector('[data-day="4"]') as HTMLElement | null;
    expect(aprilFourth).not.toBeNull();
    expect(aprilFourth!.classList.contains('attendance-history__cell--training')).toBe(false);

    httpMock.verify();
  });

  it('renders no --training modifier on any cell when academy.training_days is unconfigured', () => {
    const httpMock = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: null,
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });
    fixture.detectChanges();

    const trainingCells = fixture.nativeElement.querySelectorAll(
      '.attendance-history__cell--training',
    ) as NodeListOf<HTMLElement>;
    expect(trainingCells.length).toBe(0);
    httpMock.verify();
  });

  it('clamps aria-valuenow into [0, 100] while keeping the literal label via aria-valuetext', () => {
    const httpMock = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [3], // Wednesdays only
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    // 6 attended / 4 scheduled (Wednesdays through Apr 25) = 150%.
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [
          makeRecord({ id: 1, attended_on: '2026-04-01' }),
          makeRecord({ id: 2, attended_on: '2026-04-04' }),
          makeRecord({ id: 3, attended_on: '2026-04-08' }),
          makeRecord({ id: 4, attended_on: '2026-04-11' }),
          makeRecord({ id: 5, attended_on: '2026-04-15' }),
          makeRecord({ id: 6, attended_on: '2026-04-22' }),
        ],
      });

    const component = fixture.componentInstance as unknown as {
      ratePercent: () => number | null;
      ariaValueNow: () => number | null;
    };

    expect(component.ratePercent()).toBe(150);
    // aria-valuenow stays within [0, 100] so it matches aria-valuemax.
    expect(component.ariaValueNow()).toBe(100);
    httpMock.verify();
  });

  it('clamps the progress-bar width at 100% even when the rate exceeds it (off-schedule sessions)', () => {
    const httpMock = setupTestBed();
    TestBed.inject(AcademyService).academy.set({
      id: 1,
      name: 'Test',
      slug: 'test',
      address: null,
      logo_url: null,
      training_days: [3], // Wednesdays only
    });

    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    // April Wednesdays through Apr 25: 1, 8, 15, 22 = 4 scheduled.
    // Athlete attended on those PLUS Sat 4 + Sat 11 (open mat) = 6 total.
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [
          makeRecord({ id: 1, attended_on: '2026-04-01' }),
          makeRecord({ id: 2, attended_on: '2026-04-04' }),
          makeRecord({ id: 3, attended_on: '2026-04-08' }),
          makeRecord({ id: 4, attended_on: '2026-04-11' }),
          makeRecord({ id: 5, attended_on: '2026-04-15' }),
          makeRecord({ id: 6, attended_on: '2026-04-22' }),
        ],
      });

    expect(fixture.componentInstance['ratePercent']()).toBe(150);
    // The visible bar is clamped — but the percentage label still shows the
    // literal 150% so the instructor can see the off-schedule signal.
    expect(fixture.componentInstance['progressBarWidth']()).toBe('100%');
    httpMock.verify();
  });

  it('prev navigation refetches the previous month with correct params', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    fixture.componentInstance.prevMonth();
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`)
      .flush({ data: [makeRecord({ attended_on: '2026-03-12' })] });

    expect(fixture.componentInstance['attendedDates']().has('2026-03-12')).toBe(true);
    httpMock.verify();
  });

  it('prev navigation across January rolls year back', () => {
    vi.setSystemTime(new Date(2027, 0, 5));
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2027-01-01&to=2027-01-31`)
      .flush({ data: [] });

    fixture.componentInstance.prevMonth();
    fixture.detectChanges();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-12-01&to=2026-12-31`)
      .flush({ data: [] });

    expect(fixture.componentInstance['visible']()).toEqual({ year: 2026, month: 12 });
    httpMock.verify();
  });

  it('canGoPrev is false when visible month equals the athlete created_at month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}`)
      .flush({ data: makeAthlete({ created_at: '2026-04-01T10:00:00+00:00' }) });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance['canGoPrev']()).toBe(false);
    httpMock.verify();
  });

  it('canGoPrev is true when visible month is after the athlete created_at month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}`)
      .flush({ data: makeAthlete({ created_at: '2026-01-15T10:00:00+00:00' }) });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance['canGoPrev']()).toBe(true);
    httpMock.verify();
  });

  it('canGoNext is false when visible month equals the current month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    expect(fixture.componentInstance['canGoNext']()).toBe(false);
    httpMock.verify();
  });

  it('canGoNext becomes true after stepping back from the current month', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    fixture.componentInstance.prevMonth();
    fixture.detectChanges();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`)
      .flush({ data: [] });

    expect(fixture.componentInstance['canGoNext']()).toBe(true);
    httpMock.verify();
  });

  it('opens the popover with the notes when tapping a day that has notes', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [makeRecord({ attended_on: '2026-04-10', notes: 'Open mat — rolled with Lucia' })],
      });

    fixture.componentInstance.openNotesFor(new MouseEvent('click'), '2026-04-10');
    expect(fixture.componentInstance['activeNotes']()).toBe('Open mat — rolled with Lucia');
    httpMock.verify();
  });

  it('does not surface notes when the attended day has null notes', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [makeRecord({ attended_on: '2026-04-10', notes: null })] });

    fixture.componentInstance.openNotesFor(new MouseEvent('click'), '2026-04-10');
    expect(fixture.componentInstance['activeNotes']()).toBeNull();
    httpMock.verify();
  });

  it('exposes a notedDates set for template gating of clickable cells', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({
        data: [
          makeRecord({ id: 1, attended_on: '2026-04-10', notes: 'rolled with Lucia' }),
          makeRecord({ id: 2, attended_on: '2026-04-12', notes: null }),
        ],
      });

    expect(fixture.componentInstance['notedDates']().has('2026-04-10')).toBe(true);
    expect(fixture.componentInstance['notedDates']().has('2026-04-12')).toBe(false);
    httpMock.verify();
  });

  it('parses the created-at boundary from the YYYY-MM prefix to avoid TZ drift', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    // 23:30 UTC on Jan 31 — naive `new Date()` would shift this to Feb 01 in
    // any TZ ahead of UTC, breaking the prev-month boundary by a full month.
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}`)
      .flush({ data: makeAthlete({ created_at: '2026-01-31T23:30:00+00:00' }) });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    // Step from Apr → Mar → Feb → Jan; Jan must be reachable, prev disabled there.
    fixture.componentInstance.prevMonth();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`)
      .flush({ data: [] });
    fixture.componentInstance.prevMonth();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-02-01&to=2026-02-28`)
      .flush({ data: [] });
    fixture.componentInstance.prevMonth();
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-01-01&to=2026-01-31`)
      .flush({ data: [] });

    expect(fixture.componentInstance['visible']()).toEqual({ year: 2026, month: 1 });
    expect(fixture.componentInstance['canGoPrev']()).toBe(false);
    httpMock.verify();
  });

  it('keeps the athlete record when only the attendance call fails', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ message: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance['athlete']()?.id).toBe(ATHLETE_ID);
    expect(fixture.componentInstance['records']()).toEqual([]);
    httpMock.verify();
  });

  it('discards stale month responses that arrive after a newer navigation', () => {
    const httpMock = setupTestBed();
    const fixture = TestBed.createComponent(AttendanceHistoryComponent);
    fixture.detectChanges();

    httpMock.expectOne(`/api/v1/athletes/${ATHLETE_ID}`).flush({ data: makeAthlete() });
    httpMock
      .expectOne(`/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-04-01&to=2026-04-30`)
      .flush({ data: [] });

    // Two rapid prev clicks: April→March (in-flight), then March→February (also in-flight).
    fixture.componentInstance.prevMonth();
    const marchReq = httpMock.expectOne(
      `/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-03-01&to=2026-03-31`,
    );
    fixture.componentInstance.prevMonth();
    const februaryReq = httpMock.expectOne(
      `/api/v1/athletes/${ATHLETE_ID}/attendance?from=2026-02-01&to=2026-02-28`,
    );

    // February resolves first with its day; then the slow March response lands.
    februaryReq.flush({
      data: [makeRecord({ id: 99, attended_on: '2026-02-14' })],
    });
    marchReq.flush({
      data: [makeRecord({ id: 88, attended_on: '2026-03-22' })],
    });

    // Stale March response must NOT overwrite the February state.
    expect(fixture.componentInstance['records']().some((r) => r.id === 99)).toBe(true);
    expect(fixture.componentInstance['records']().some((r) => r.id === 88)).toBe(false);
    httpMock.verify();
  });
});
