import { CalendarLesson, SyllabusCalendar } from '../../../../core/services/stats.service';
import { mondayOf } from './season-map.model';

/** The words the message needs that are not the programme's own. */
export interface WeekPlanLabels {
  readonly heading: string;
  /** Short weekday names, Monday first. */
  readonly weekdays: readonly string[];
}

/** A position, and what the lesson does from it. */
interface TopicGroup {
  readonly name: string;
  readonly techniques: string[];
}

/**
 * The week the message is about (#1863): this one while it still has a plan
 * ahead, and the next one once it has not — the Sunday-evening message, sent
 * when this week's lessons are behind it. Null when neither has anything
 * planned: a message about a week further out is not "the week's plan".
 */
export function publishedWeek(calendar: SyllabusCalendar): string | null {
  const thisWeek = mondayOf(calendar.today);
  const nextWeek = addDays(thisWeek, 7);

  for (const week of [thisWeek, nextWeek]) {
    if (plannedIn(calendar, week).length > 0) return week;
  }
  return null;
}

/**
 * The week's plan as plain text for the academy's group (#1863): a heading,
 * then one line per planned lesson — day, class, and what it covers, each
 * technique under its position.
 *
 * Planned lessons only. A lesson somebody was checked into already happened,
 * and one nobody confirmed is not a plan any more. The names are the
 * programme's own words, never translated; only the heading and the weekday
 * come from the reader's language. Null when the week has nothing planned.
 */
export function weekPlanText(
  calendar: SyllabusCalendar,
  week: string,
  labels: WeekPlanLabels,
): string | null {
  const lessons = [...plannedIn(calendar, week)].sort(byDayThenTime);
  if (lessons.length === 0) return null;

  const lines = lessons.map((lesson) =>
    [dayLabel(lesson.held_on, labels), lesson.name, topicsLine(calendar, lesson)].join(' · '),
  );
  return [labels.heading, ...lines].join('\n');
}

function plannedIn(calendar: SyllabusCalendar, week: string): CalendarLesson[] {
  return calendar.lessons.filter(
    (lesson) => lesson.state === 'planned' && mondayOf(lesson.held_on) === week,
  );
}

/** Day, then time; a class with no time after those that have one. */
function byDayThenTime(a: CalendarLesson, b: CalendarLesson): number {
  if (a.held_on !== b.held_on) return a.held_on < b.held_on ? -1 : 1;
  const at = a.starts_at ?? '99:99';
  const bt = b.starts_at ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id - b.id;
}

/** "Mer 14". */
function dayLabel(iso: string, labels: WeekPlanLabels): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${labels.weekdays[weekday]} ${d}`;
}

/**
 * "Half guard: Knee shield, Lockdown; Back: Bow and arrow choke".
 *
 * Positions in programme order, so two lessons on the same area read the
 * same way. A position named on its own prints alone; named beside one of
 * its techniques, it prints once, as the group's name. A technique whose
 * position has left the programme prints alone, after the rest.
 */
function topicsLine(calendar: SyllabusCalendar, lesson: CalendarLesson): string {
  const programme = new Map(calendar.positions.map((p, index) => [p.id, { name: p.name, index }]));
  const groups = new Map<number, TopicGroup>();
  const loose: string[] = [];

  for (const topic of lesson.topics) {
    const positionId = topic.parent_id ?? topic.id;
    const known = programme.get(positionId);
    if (known === undefined && topic.parent_id !== null) {
      loose.push(topic.name);
      continue;
    }

    const group = groups.get(positionId) ?? { name: known?.name ?? topic.name, techniques: [] };
    if (topic.parent_id !== null) group.techniques.push(topic.name);
    groups.set(positionId, group);
  }

  const ordered = [...groups.entries()]
    .sort(([a], [b]) => orderOf(programme, a) - orderOf(programme, b))
    .map(([, group]) => groupText(group));
  return [...ordered, ...loose].join('; ');
}

function orderOf(programme: Map<number, { index: number }>, positionId: number): number {
  return programme.get(positionId)?.index ?? Number.MAX_SAFE_INTEGER;
}

function groupText(group: TopicGroup): string {
  return group.techniques.length === 0
    ? group.name
    : `${group.name}: ${group.techniques.join(', ')}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
