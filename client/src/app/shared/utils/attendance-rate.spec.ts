import type { AcademySchedule } from '../../core/services/academy.service';
import {
  attendanceRate,
  countScheduledTrainingDays,
  schedulesForAcademy,
  scheduleForDate,
} from './attendance-rate';

/**
 * Helper to build a synthetic single-row schedule history covering all
 * dates — replaces the pre-1094 shape where the function just took a
 * raw `trainingDays` array. Lets the original behavioural tests keep
 * their dates/expectations while exercising the new code path.
 */
function singleSchedule(trainingDays: number[] | null | undefined): AcademySchedule[] | null {
  if (trainingDays === null || trainingDays === undefined) return null;
  return [
    {
      id: 1,
      training_days: trainingDays.length === 0 ? null : trainingDays,
      effective_from: '1970-01-01',
    },
  ];
}

describe('countScheduledTrainingDays', () => {
  it('returns null when schedules is null/undefined/empty (academy has no schedule history)', () => {
    expect(countScheduledTrainingDays(null, 2026, 4, new Date(2026, 3, 15))).toBeNull();
    expect(countScheduledTrainingDays(undefined, 2026, 4, new Date(2026, 3, 15))).toBeNull();
    expect(countScheduledTrainingDays([], 2026, 4, new Date(2026, 3, 15))).toBeNull();
  });

  it('returns null when every in-effect schedule has training_days = null (not configured)', () => {
    // The schedule exists but is the "not configured" sentinel. We
    // should signal "hide percentage UI" (same as no history at all).
    const notConfigured = singleSchedule([]);
    expect(countScheduledTrainingDays(notConfigured, 2026, 4, new Date(2026, 3, 15))).toBeNull();
  });

  it('counts every training day in a fully-past month with no cap', () => {
    // March 2026: Tuesdays = 3, 10, 17, 24, 31 (5). Thursdays = 5, 12, 19, 26 (4).
    // Saturdays = 7, 14, 21, 28 (4). total scheduled = 5 + 4 + 4 = 13.
    expect(
      countScheduledTrainingDays(singleSchedule([2, 4, 6]), 2026, 3, new Date(2026, 3, 15)),
    ).toBe(13);
  });

  it('caps at today for the current month', () => {
    // April 2026 — assume today is Apr 15 (Wed).
    // Mon/Wed/Fri = 1, 3, 5. April 1 (Wed), 3 (Fri), 6 (Mon), 8 (Wed), 10 (Fri),
    // 13 (Mon), 15 (Wed) = 7 sessions through and including today.
    expect(
      countScheduledTrainingDays(singleSchedule([1, 3, 5]), 2026, 4, new Date(2026, 3, 15)),
    ).toBe(7);
  });

  it('returns 0 when the visible month is entirely in the future', () => {
    // Today is mid-April; visible is May. Schedule history exists so
    // we return 0 (denominator known to be zero), not null (denominator
    // unknown).
    expect(
      countScheduledTrainingDays(singleSchedule([1, 3, 5]), 2026, 5, new Date(2026, 3, 15)),
    ).toBe(0);
  });

  it('includes today when today itself is a training day', () => {
    // April 15 2026 is a Wednesday. With Wed in the schedule, the count for
    // April-up-to-today must INCLUDE Apr 15.
    const withToday = countScheduledTrainingDays(
      singleSchedule([3]),
      2026,
      4,
      new Date(2026, 3, 15),
    );
    // Wednesdays in April through Apr 15: Apr 1, 8, 15 = 3.
    expect(withToday).toBe(3);
  });

  it('excludes a future day when today is a non-training day BEFORE the next training day', () => {
    // Today is Apr 14 (Tue). Schedule: Wed only. Wednesdays in April: 1, 8.
    // Apr 15 (Wed) is tomorrow → excluded.
    expect(countScheduledTrainingDays(singleSchedule([3]), 2026, 4, new Date(2026, 3, 14))).toBe(2);
  });

  describe('mid-period schedule transitions (#1094)', () => {
    it('splits a calendar month across two segments at effective_from', () => {
      // June 2026:
      //   Schedule A — Tue/Thu/Sat (2, 4, 6), effective from start of history.
      //   Schedule B — Mon/Wed/Fri (1, 3, 5), effective from Jun 16.
      // Through Jun 30 (whole month, today = end of June):
      //   Up to and including Jun 15 (A): Jun 2 (Tue), 4 (Thu), 6 (Sat),
      //     9 (Tue), 11 (Thu), 13 (Sat) = 6 — Jun 15 is a Mon, not in A.
      //   From Jun 16 (B): 17 (Wed), 19 (Fri), 22 (Mon), 24 (Wed),
      //     26 (Fri), 29 (Mon) = 6.
      // Total = 12.
      const schedules: AcademySchedule[] = [
        { id: 2, training_days: [1, 3, 5], effective_from: '2026-06-16' },
        { id: 1, training_days: [2, 4, 6], effective_from: '2026-01-01' },
      ];
      expect(countScheduledTrainingDays(schedules, 2026, 6, new Date(2026, 5, 30))).toBe(12);
    });

    it('a future-dated change in the SAME month does not contribute past today', () => {
      // Today is Jun 10 (Wed). New schedule starts Jun 16. The cap at
      // today means only the OLD schedule contributes: Tue/Thu/Sat
      // through Jun 10 = Jun 2 (Tue), 4 (Thu), 6 (Sat), 9 (Tue) = 4.
      const schedules: AcademySchedule[] = [
        { id: 2, training_days: [1, 3, 5], effective_from: '2026-06-16' },
        { id: 1, training_days: [2, 4, 6], effective_from: '2026-01-01' },
      ];
      expect(countScheduledTrainingDays(schedules, 2026, 6, new Date(2026, 5, 10))).toBe(4);
    });

    it('treats a day exactly on effective_from with the NEW schedule', () => {
      // Boundary semantics — the helper resolves to the largest
      // effective_from <= candidate. A day equal to effective_from
      // matches the new row. Jun 16 2026 is a Tuesday.
      //   Schedule A — Mon only ([1]); B — Tue only ([2]) from Jun 16.
      // Through Jun 16 (today):
      //   A: Jun 1, 8, 15 = 3.
      //   B: Jun 16 = 1.
      // Total = 4.
      const schedules: AcademySchedule[] = [
        { id: 2, training_days: [2], effective_from: '2026-06-16' },
        { id: 1, training_days: [1], effective_from: '2026-01-01' },
      ];
      expect(countScheduledTrainingDays(schedules, 2026, 6, new Date(2026, 5, 16))).toBe(4);
    });

    it('skips days before any covering schedule row (date < oldest effective_from)', () => {
      // The academy started keeping schedule history on Jun 15. The
      // first half of June has NO covering row → those days don't
      // contribute and don't flip the "any configured" flag for the
      // visible month.
      //   Schedule [1, 3, 5] effective Jun 15. Today = Jun 30.
      //   Days that contribute: Jun 15 (Mon), 17 (Wed), 19 (Fri),
      //     22 (Mon), 24 (Wed), 26 (Fri), 29 (Mon) = 7.
      const schedules: AcademySchedule[] = [
        { id: 1, training_days: [1, 3, 5], effective_from: '2026-06-15' },
      ];
      expect(countScheduledTrainingDays(schedules, 2026, 6, new Date(2026, 5, 30))).toBe(7);
    });

    it('returns null when every covered day fell on a not-configured schedule', () => {
      // History exists but the only covering row has training_days null
      // for the whole visible range. Treat as "not configured" not
      // "0 of 0".
      const schedules: AcademySchedule[] = [
        { id: 1, training_days: null, effective_from: '2026-01-01' },
      ];
      expect(countScheduledTrainingDays(schedules, 2026, 6, new Date(2026, 5, 30))).toBeNull();
    });
  });
});

describe('scheduleForDate', () => {
  const history: AcademySchedule[] = [
    { id: 3, training_days: [0, 6], effective_from: '2026-12-01' },
    { id: 2, training_days: [2, 4], effective_from: '2026-06-01' },
    { id: 1, training_days: [1, 3, 5], effective_from: '2026-01-01' },
  ];

  it('returns null when schedules is null/undefined/empty', () => {
    expect(scheduleForDate(null, new Date(2026, 5, 15))).toBeNull();
    expect(scheduleForDate(undefined, new Date(2026, 5, 15))).toBeNull();
    expect(scheduleForDate([], new Date(2026, 5, 15))).toBeNull();
  });

  it('returns the largest effective_from <= the candidate date', () => {
    // Exact match on Jun 1 — picks the Jun 1 row.
    expect(scheduleForDate(history, new Date(2026, 5, 1))?.id).toBe(2);
    // Between Jun 1 and Dec 1 — sees the Jun 1 row.
    expect(scheduleForDate(history, new Date(2026, 9, 15))?.id).toBe(2);
    // After Dec 1 — sees the Dec 1 row.
    expect(scheduleForDate(history, new Date(2026, 11, 25))?.id).toBe(3);
  });

  it('returns null when candidate is before the earliest row', () => {
    // Dec 31 2025 — before the Jan 1 row.
    expect(scheduleForDate(history, new Date(2025, 11, 31))).toBeNull();
  });
});

describe('schedulesForAcademy', () => {
  it('returns null when the academy is null/undefined', () => {
    expect(schedulesForAcademy(null)).toBeNull();
    expect(schedulesForAcademy(undefined)).toBeNull();
  });

  it('prefers academy.schedules when present and non-empty', () => {
    const academy = {
      training_days: [9, 9],
      schedules: [{ id: 7, training_days: [1, 3, 5], effective_from: '2026-06-01' }],
    };
    expect(schedulesForAcademy(academy)?.[0].id).toBe(7);
  });

  it('synthesises a single-row history from training_days when schedules is missing', () => {
    const academy = { training_days: [2, 4] };
    const result = schedulesForAcademy(academy);
    expect(result).not.toBeNull();
    expect(result?.length).toBe(1);
    expect(result?.[0].training_days).toEqual([2, 4]);
    expect(result?.[0].effective_from).toBe('1970-01-01');
  });

  it('synthesises a single-row history with null training_days when academy.training_days is null', () => {
    const academy = { training_days: null };
    const result = schedulesForAcademy(academy);
    expect(result?.[0].training_days).toBeNull();
  });

  it('returns null when neither field is present', () => {
    expect(schedulesForAcademy({})).toBeNull();
  });
});

describe('attendanceRate', () => {
  it('returns the ratio as a 0..1 float when both inputs are valid', () => {
    expect(attendanceRate(12, 18)).toBeCloseTo(0.6667, 4);
    expect(attendanceRate(0, 5)).toBe(0);
    expect(attendanceRate(5, 5)).toBe(1);
  });

  it('returns null when scheduled is null (training_days not configured)', () => {
    expect(attendanceRate(7, null)).toBeNull();
  });

  it('returns null when scheduled is 0 (no sessions held in the period yet)', () => {
    expect(attendanceRate(0, 0)).toBeNull();
  });

  it('does NOT clamp at 1 when attended exceeds scheduled (off-schedule open mat)', () => {
    // The instructor should see "trained on a non-scheduled day"; clamping
    // would hide that signal.
    expect(attendanceRate(6, 4)).toBeCloseTo(1.5, 4);
  });
});
