import {
  CalendarLesson,
  CoveragePosition,
  SyllabusCalendar,
} from '../../../../core/services/stats.service';
import { buildRows, cellLessons, mondayOf, monthOfWeek, monthStarts } from './season-map.model';

function position(id: number, name: string, covered = 1, inScope = 4): CoveragePosition {
  return { id, name, kind: 'both', in_scope: inScope, covered, thin: 0, missing: 0, worked: 0 };
}

function lesson(over: Partial<CalendarLesson>): CalendarLesson {
  return {
    id: 1,
    academy_class_id: 7,
    held_on: '2026-10-12',
    name: 'Fundamentals',
    starts_at: '19:00',
    kind: 'gi',
    state: 'held',
    position_ids: [1],
    topics: [{ id: 11, name: 'Armbar', parent_id: 1 }],
    ...over,
  };
}

function calendar(over: Partial<SyllabusCalendar> = {}): SyllabusCalendar {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    today: '2026-10-14',
    weeks: ['2026-10-05', '2026-10-12', '2026-10-19'],
    positions: [
      {
        id: 1,
        name: 'Closed guard',
        kind: 'both',
        cells: [
          { week: '2026-10-05', held: 1, planned: 0, unconfirmed: 0 },
          { week: '2026-10-12', held: 2, planned: 1, unconfirmed: 0 },
        ],
      },
      {
        id: 2,
        name: 'Half guard',
        kind: 'both',
        cells: [
          { week: '2026-10-05', held: 0, planned: 0, unconfirmed: 1 },
          { week: '2026-10-19', held: 0, planned: 2, unconfirmed: 0 },
        ],
      },
    ],
    lessons: [],
    ...over,
  };
}

describe('season map model (#1858)', () => {
  it('finds the Monday of any day, Sunday included', () => {
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    // Across a month and a year boundary.
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });

  it('gives a week the month of its Thursday, so 31 August is a September week', () => {
    expect(monthOfWeek('2026-08-31')).toBe(9);
    // Monday 28 September's Thursday is 1 October.
    expect(monthOfWeek('2026-09-28')).toBe(10);
    expect(monthOfWeek('2026-09-21')).toBe(9);
  });

  it('prints each month once, over its first week, and never a second September at the end', () => {
    const season = { start: '2026-09-01', end: '2027-08-31' };
    const weeks = ['2026-08-31', '2026-09-07', '2026-09-28', '2027-08-23', '2027-08-30'];

    // 30 August 2027's Thursday is in September, past the season's end.
    expect(monthStarts(weeks, season)).toEqual([9, null, 10, 8, null]);
  });

  it('draws one cell per week of the season, in order, for each position the report lists', () => {
    const rows = buildRows([position(1, 'Closed guard'), position(2, 'Half guard')], calendar());

    expect(rows.map((r) => r.name)).toEqual(['Closed guard', 'Half guard']);
    expect(rows[0].cells.map((c) => c.week)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('shades one lesson lighter than two, and outlines a plan', () => {
    const [guard, half] = buildRows(
      [position(1, 'Closed guard'), position(2, 'Half guard')],
      calendar(),
    );

    expect(guard.cells.map((c) => c.tone)).toEqual(['once', 'more', 'none']);
    expect(half.cells.map((c) => c.tone)).toEqual(['unconfirmed', 'none', 'planned']);
  });

  it('keeps a plan visible in a week that was also taught', () => {
    const [guard] = buildRows([position(1, 'Closed guard')], calendar());

    expect(guard.cells[1].alsoPlanned).toBe(true);
    expect(guard.cells[0].alsoPlanned).toBe(false);
  });

  it('marks the column of the server today', () => {
    const [guard] = buildRows([position(1, 'Closed guard')], calendar());

    expect(guard.cells.map((c) => c.current)).toEqual([false, true, false]);
  });

  it('follows the report rows, not the map: a position the report leaves out gets no row', () => {
    const rows = buildRows([position(2, 'Half guard', 0, 3)], calendar());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 2, covered: 0, inScope: 3 });
  });

  it('draws a row with empty weeks for a position the map has nothing on', () => {
    const [row] = buildRows([position(9, 'Back')], calendar());

    expect(row.cells.every((c) => c.tone === 'none')).toBe(true);
  });

  it('lists the lessons a cell counts, and only those', () => {
    const data = calendar({
      lessons: [
        lesson({ id: 1, held_on: '2026-10-12', position_ids: [1] }),
        lesson({ id: 2, held_on: '2026-10-14', position_ids: [1], state: 'planned' }),
        // Same week, another position.
        lesson({ id: 3, held_on: '2026-10-13', position_ids: [2] }),
        // Same position, another week.
        lesson({ id: 4, held_on: '2026-10-05', position_ids: [1] }),
      ],
    });

    expect(cellLessons(data, 1, '2026-10-12').map((l) => l.id)).toEqual([1, 2]);
  });

  it('names what each lesson did on the position, the position itself included', () => {
    const data = calendar({
      lessons: [
        lesson({
          topics: [
            { id: 1, name: 'Closed guard', parent_id: null },
            { id: 11, name: 'Armbar', parent_id: 1 },
            { id: 21, name: 'Knee shield', parent_id: 2 },
          ],
        }),
      ],
    });

    expect(cellLessons(data, 1, '2026-10-12')[0].topicNames).toEqual(['Closed guard', 'Armbar']);
  });
});
