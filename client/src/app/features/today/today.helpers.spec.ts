import { describe, expect, it } from 'vitest';
import { AcademyClass } from '../../core/services/academy-class.service';
import {
  isoDay,
  joinedSince,
  nextClassAfter,
  presencesSince,
  timeRange,
  tonightClasses,
  weekStart,
} from './today.helpers';

function cls(overrides: Partial<AcademyClass> = {}): AcademyClass {
  return {
    id: 1,
    name: 'Fondamentali',
    weekday: 1,
    starts_at: '19:00',
    duration_minutes: 90,
    kind: 'gi',
    ...overrides,
  };
}

// Thursday 24 September 2026, 18:30 local.
const THURSDAY = new Date(2026, 8, 24, 18, 30);

describe('today helpers', () => {
  it('isoDay formats the local calendar day, not the UTC one', () => {
    expect(isoDay(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(isoDay(new Date(2026, 0, 3, 0, 1))).toBe('2026-01-03');
  });

  it("tonightClasses keeps the date's weekday only, in the server's order", () => {
    const classes = [
      cls({ id: 1, weekday: 4, starts_at: '19:00' }),
      cls({ id: 2, weekday: 2 }),
      cls({ id: 3, weekday: 4, starts_at: '20:30' }),
    ];

    expect(tonightClasses(classes, THURSDAY).map((c) => c.id)).toEqual([1, 3]);
  });

  it('nextClassAfter finds the first class on a later day, wrapping the week', () => {
    const classes = [
      cls({ id: 1, weekday: 1, starts_at: '19:00' }),
      cls({ id: 2, weekday: 3, starts_at: '19:00' }),
    ];

    // Thursday → the next is Monday, four days on.
    const next = nextClassAfter(classes, THURSDAY);
    expect(next?.academyClass.id).toBe(1);
    expect(isoDay(next!.date)).toBe('2026-09-28');
  });

  it("nextClassAfter never answers with today's own class", () => {
    const classes = [cls({ id: 1, weekday: 4 })];

    // The only class is on Thursdays, so the next one is a week away.
    expect(isoDay(nextClassAfter(classes, THURSDAY)!.date)).toBe('2026-10-01');
  });

  it('nextClassAfter is null for an empty timetable', () => {
    expect(nextClassAfter([], THURSDAY)).toBeNull();
  });

  it('weekStart is the Monday of the week, and Sunday belongs to the week it ends', () => {
    expect(isoDay(weekStart(THURSDAY))).toBe('2026-09-21');
    expect(isoDay(weekStart(new Date(2026, 8, 21, 8, 0)))).toBe('2026-09-21');
    expect(isoDay(weekStart(new Date(2026, 8, 27, 20, 0)))).toBe('2026-09-21');
  });

  it('presencesSince sums the points from the first day on, and nothing earlier', () => {
    const points = [
      { date: '2026-09-18', count: 30 },
      { date: '2026-09-21', count: 12 },
      { date: '2026-09-23', count: 9 },
    ];

    expect(presencesSince(points, '2026-09-21')).toBe(21);
    expect(presencesSince([], '2026-09-21')).toBe(0);
  });

  it('joinedSince keeps the athletes whose joining date is on or after the day', () => {
    const athletes = [
      { id: 1, joined_at: '2026-09-21' },
      { id: 2, joined_at: '2026-09-20' },
      { id: 3, joined_at: '2026-09-24' },
    ];

    expect(joinedSince(athletes, '2026-09-21').map((a) => a.id)).toEqual([1, 3]);
  });

  it('timeRange reads start and end, the start alone, or nothing', () => {
    expect(timeRange(cls({ starts_at: '19:00', duration_minutes: 90 }))).toBe('19:00–20:30');
    expect(timeRange(cls({ starts_at: '23:30', duration_minutes: 60 }))).toBe('23:30–00:30');
    expect(timeRange(cls({ starts_at: '19:00', duration_minutes: null }))).toBe('19:00');
    expect(timeRange(cls({ starts_at: null }))).toBeNull();
  });
});
