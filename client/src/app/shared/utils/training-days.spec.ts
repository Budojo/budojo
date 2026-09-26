import type { AcademyClosure, AcademySchedule } from '../../core/services/academy.service';
import { closureOn, schedulesForAcademy, scheduleForDate } from './training-days';

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

describe('closureOn (#1766)', () => {
  const summer: AcademyClosure[] = [
    { id: 1, starts_on: '2026-08-10', ends_on: '2026-08-25', label: 'Chiusura estiva' },
    // Inside the first: overlapping closures change nothing.
    { id: 2, starts_on: '2026-08-15', ends_on: '2026-08-15', label: null },
  ];

  it('finds the closure a day falls in, ends inclusive', () => {
    expect(closureOn(summer, new Date(2026, 7, 10))?.label).toBe('Chiusura estiva');
    expect(closureOn(summer, new Date(2026, 7, 25))?.id).toBe(1);
    expect(closureOn(summer, new Date(2026, 7, 26))).toBeNull();
    expect(closureOn(undefined, new Date(2026, 7, 12))).toBeNull();
  });
});
