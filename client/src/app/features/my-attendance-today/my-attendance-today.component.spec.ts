import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { provideI18nTesting } from '../../../test-utils/i18n-test';
import {
  AttendanceRecord,
  AttendanceService,
  MarkTodayResult,
  UnmarkTodayResult,
} from '../../core/services/attendance.service';
import { MyAttendanceTodayComponent } from './my-attendance-today.component';

const baseRecord = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 1,
  athlete_id: 7,
  attended_on: '2026-05-22',
  notes: null,
  source: 'self',
  created_at: '2026-05-22T08:00:00Z',
  deleted_at: null,
  ...overrides,
});

interface AttendanceStub {
  markToday: ReturnType<typeof vi.fn>;
  unmarkToday: ReturnType<typeof vi.fn>;
}

function setup(): {
  fixture: ComponentFixture<MyAttendanceTodayComponent>;
  svc: AttendanceStub;
  add: ReturnType<typeof vi.fn>;
  router: Router;
} {
  const svc: AttendanceStub = {
    markToday: vi.fn(),
    unmarkToday: vi.fn(),
  };
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MyAttendanceTodayComponent],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      ...provideI18nTesting(),
      { provide: AttendanceService, useValue: svc },
      { provide: MessageService, useValue: messageService },
    ],
  });
  const fixture = TestBed.createComponent(MyAttendanceTodayComponent);
  fixture.detectChanges();
  return { fixture, svc, add: messageService.add, router: TestBed.inject(Router) };
}

describe('MyAttendanceTodayComponent (#960)', () => {
  it('mounts in the unmarked state with a visible "I am here today" button', () => {
    const { fixture } = setup();
    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-unmarked"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="attendance-today-mark"]')).not.toBeNull();
  });

  it('on mark success: flips to the marked state with source=self + shows Annulla', async () => {
    const { fixture, svc } = setup();
    svc.markToday.mockReturnValue(
      of<MarkTodayResult>({ status: 'marked', record: baseRecord({ source: 'self' }) }),
    );
    (fixture.componentInstance as unknown as { onMark(): void }).onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-marked"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-unmark"]'),
    ).not.toBeNull();
  });

  it('on mark success with instructor-source: marked panel but Annulla is hidden', async () => {
    const { fixture, svc } = setup();
    // Server returns 200 with the existing instructor-marked row.
    svc.markToday.mockReturnValue(
      of<MarkTodayResult>({ status: 'marked', record: baseRecord({ source: 'instructor' }) }),
    );
    (fixture.componentInstance as unknown as { onMark(): void }).onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-marked"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-cy="attendance-today-unmark"]')).toBeNull();
  });

  it('on mark not-training-day: flips to the not-training-day panel', async () => {
    const { fixture, svc } = setup();
    svc.markToday.mockReturnValue(of<MarkTodayResult>({ status: 'not-training-day' }));
    (fixture.componentInstance as unknown as { onMark(): void }).onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-not-training"]'),
    ).not.toBeNull();
  });

  it('on mark no-athlete: bounces to the owner dashboard', async () => {
    const { fixture, svc, router } = setup();
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    svc.markToday.mockReturnValue(of<MarkTodayResult>({ status: 'no-athlete' }));
    (fixture.componentInstance as unknown as { onMark(): void }).onMark();
    await fixture.whenStable();

    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('on mark error: stays unmarked + surfaces a toast', async () => {
    const { fixture, svc, add } = setup();
    svc.markToday.mockReturnValue(throwError(() => new Error('boom')));
    (fixture.componentInstance as unknown as { onMark(): void }).onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-unmarked"]'),
    ).not.toBeNull();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('on unmark success: flips back to the unmarked state', async () => {
    const { fixture, svc } = setup();
    // Pre-condition: mark first.
    svc.markToday.mockReturnValue(
      of<MarkTodayResult>({ status: 'marked', record: baseRecord({ source: 'self' }) }),
    );
    const cmp = fixture.componentInstance as unknown as { onMark(): void; onUnmark(): void };
    cmp.onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    svc.unmarkToday.mockReturnValue(of<UnmarkTodayResult>({ status: 'unmarked' }));
    cmp.onUnmark();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-cy="attendance-today-unmarked"]'),
    ).not.toBeNull();
  });

  it('on unmark race (instructor-locked): keeps marked + flips source to instructor + warn toast', async () => {
    const { fixture, svc, add } = setup();
    svc.markToday.mockReturnValue(
      of<MarkTodayResult>({ status: 'marked', record: baseRecord({ source: 'self' }) }),
    );
    const cmp = fixture.componentInstance as unknown as { onMark(): void; onUnmark(): void };
    cmp.onMark();
    await fixture.whenStable();
    fixture.detectChanges();

    svc.unmarkToday.mockReturnValue(of<UnmarkTodayResult>({ status: 'instructor-locked' }));
    cmp.onUnmark();
    await fixture.whenStable();
    fixture.detectChanges();

    // Annulla button gone because canUnmark() flipped to false.
    expect(fixture.nativeElement.querySelector('[data-cy="attendance-today-unmark"]')).toBeNull();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });

  it('does not fire a second POST while a mark is in flight (busy guard)', async () => {
    const { fixture, svc } = setup();
    // The observable never completes — simulates a slow request.
    svc.markToday.mockReturnValue(of<MarkTodayResult>());
    const cmp = fixture.componentInstance as unknown as { onMark(): void };
    cmp.onMark();
    cmp.onMark();
    cmp.onMark();
    await fixture.whenStable();
    expect(svc.markToday).toHaveBeenCalledTimes(1);
  });
});
