import {
  CalendarLesson,
  CoveragePosition,
  SyllabusCalendar,
} from '../../../../core/services/stats.service';

/**
 * How a week reads on a position's row (#1858).
 *
 * One hue at two strengths for what was taught, never two hues (#1550): one
 * lesson and several are a scale. A plan is an outline, because it has not
 * happened; a plan nobody checked into is hatched, because it is neither
 * taught nor nothing.
 */
export type CellTone = 'none' | 'once' | 'more' | 'planned' | 'unconfirmed';

export interface MapCell {
  readonly week: string;
  readonly held: number;
  readonly planned: number;
  readonly unconfirmed: number;
  readonly tone: CellTone;
  /** Taught this week, and more of it planned — the plan stays visible. */
  readonly alsoPlanned: boolean;
  /** The week holding the server's today. */
  readonly current: boolean;
}

export interface MapRow {
  readonly id: number;
  readonly name: string;
  readonly covered: number;
  readonly inScope: number;
  readonly cells: readonly MapCell[];
}

export interface CellLesson extends CalendarLesson {
  /** What the lesson did on this position: the position itself, or its techniques. */
  readonly topicNames: readonly string[];
}

/** The Monday of the ISO week holding `iso` (a `Y-m-d` string). */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 = Sunday. ISO weeks start on Monday.
  const back = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

/**
 * The month (1-12) a week belongs to: the month of its Thursday, as ISO
 * numbers weeks. The week of Monday 31 August is a September week.
 *
 * Kept inside the season when one is given: the last week of a season ending
 * on 31 August has its Thursday in September, and a "Sep" at the far end of
 * the map would read as a second September.
 */
export function monthOfWeek(monday: string, season?: { start: string; end: string }): number {
  const [y, m, d] = monday.split('-').map(Number);
  let thursday = new Date(Date.UTC(y, m - 1, d + 3)).toISOString().slice(0, 10);
  if (season && thursday > season.end) thursday = season.end;
  if (season && thursday < season.start) thursday = season.start;
  return Number(thursday.slice(5, 7));
}

/**
 * The month to print over each week: its month where a month begins, and
 * null over every other week.
 */
export function monthStarts(
  weeks: readonly string[],
  season: { start: string; end: string },
): (number | null)[] {
  return weeks.map((week, i) => {
    const month = monthOfWeek(week, season);
    return i > 0 && monthOfWeek(weeks[i - 1], season) === month ? null : month;
  });
}

function toneOf(held: number, planned: number, unconfirmed: number): CellTone {
  if (held >= 2) return 'more';
  if (held === 1) return 'once';
  if (planned > 0) return 'planned';
  if (unconfirmed > 0) return 'unconfirmed';
  return 'none';
}

/**
 * One row per position the coverage report lists, in its order, with a cell
 * for every week of the season.
 *
 * The report decides the rows — they carry its fraction — so a position the
 * report leaves out (nothing in scope under the filter) has no row here
 * either, and one the map has nothing on is a row of empty weeks.
 */
export function buildRows(
  positions: readonly CoveragePosition[],
  calendar: SyllabusCalendar,
): MapRow[] {
  const currentWeek = mondayOf(calendar.today);
  const byPosition = new Map(
    calendar.positions.map((p) => [p.id, new Map(p.cells.map((c) => [c.week, c]))]),
  );

  return positions.map((position) => {
    const cells = byPosition.get(position.id);
    return {
      id: position.id,
      name: position.name,
      covered: position.covered,
      inScope: position.in_scope,
      cells: calendar.weeks.map((week) => {
        const cell = cells?.get(week);
        const held = cell?.held ?? 0;
        const planned = cell?.planned ?? 0;
        const unconfirmed = cell?.unconfirmed ?? 0;
        return {
          week,
          held,
          planned,
          unconfirmed,
          tone: toneOf(held, planned, unconfirmed),
          alsoPlanned: held > 0 && planned > 0,
          current: week === currentWeek,
        };
      }),
    };
  });
}

export interface WeekLessons {
  readonly week: string;
  readonly lessons: readonly CellLesson[];
}

/**
 * A position's whole season: every week with something on it, oldest first,
 * each with the lessons its cell counts. What the row's name opens — the
 * same content as the cells, reachable with one tab stop per row.
 */
export function positionSeason(calendar: SyllabusCalendar, positionId: number): WeekLessons[] {
  return calendar.weeks
    .map((week) => ({ week, lessons: cellLessons(calendar, positionId, week) }))
    .filter((group) => group.lessons.length > 0);
}

/** The lessons one cell counts: that week, and counted for that position. */
export function cellLessons(
  calendar: SyllabusCalendar,
  positionId: number,
  week: string,
): CellLesson[] {
  return calendar.lessons
    .filter((l) => l.position_ids.includes(positionId) && mondayOf(l.held_on) === week)
    .map((l) => ({
      ...l,
      topicNames: l.topics
        .filter((t) => t.id === positionId || t.parent_id === positionId)
        .map((t) => t.name),
    }));
}
