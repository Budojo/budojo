import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceHistoryComponent } from './attendance-history.component';
import { Athlete } from '../../../../core/services/athlete.service';
import { AttendanceRecord } from '../../../../core/services/attendance.service';

const ATHLETE_ID = 42;

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone: null,
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
});
