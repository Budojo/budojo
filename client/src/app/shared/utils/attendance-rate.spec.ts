import { attendanceRate, countScheduledTrainingDays } from './attendance-rate';

describe('countScheduledTrainingDays', () => {
  it('returns null when trainingDays is null/undefined/empty (academy schedule not configured)', () => {
    expect(countScheduledTrainingDays(null, 2026, 4, new Date(2026, 3, 15))).toBeNull();
    expect(countScheduledTrainingDays(undefined, 2026, 4, new Date(2026, 3, 15))).toBeNull();
    expect(countScheduledTrainingDays([], 2026, 4, new Date(2026, 3, 15))).toBeNull();
  });

  it('counts every training day in a fully-past month with no cap', () => {
    // March 2026: Tuesdays = 3, 10, 17, 24, 31 (5). Thursdays = 5, 12, 19, 26 (4).
    // Saturdays = 7, 14, 21, 28 (4). total scheduled = 5 + 4 + 4 = 13.
    expect(countScheduledTrainingDays([2, 4, 6], 2026, 3, new Date(2026, 3, 15))).toBe(13);
  });

  it('caps at today for the current month', () => {
    // April 2026 — assume today is Apr 15 (Wed).
    // Mon/Wed/Fri = 1, 3, 5. April 1 (Wed), 3 (Fri), 6 (Mon), 8 (Wed), 10 (Fri),
    // 13 (Mon), 15 (Wed) = 7 sessions through and including today.
    expect(countScheduledTrainingDays([1, 3, 5], 2026, 4, new Date(2026, 3, 15))).toBe(7);
  });

  it('returns 0 when the visible month is entirely in the future', () => {
    // Today is mid-April; visible is May.
    expect(countScheduledTrainingDays([1, 3, 5], 2026, 5, new Date(2026, 3, 15))).toBe(0);
  });

  it('includes today when today itself is a training day', () => {
    // April 15 2026 is a Wednesday. With Wed in the schedule, the count for
    // April-up-to-today must INCLUDE Apr 15.
    const withToday = countScheduledTrainingDays([3], 2026, 4, new Date(2026, 3, 15));
    // Wednesdays in April through Apr 15: Apr 1, 8, 15 = 3.
    expect(withToday).toBe(3);
  });

  it('excludes a future day when today is a non-training day BEFORE the next training day', () => {
    // Today is Apr 14 (Tue). Schedule: Wed only. Wednesdays in April: 1, 8.
    // Apr 15 (Wed) is tomorrow → excluded.
    expect(countScheduledTrainingDays([3], 2026, 4, new Date(2026, 3, 14))).toBe(2);
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
