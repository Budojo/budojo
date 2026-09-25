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
 * Which week the message is about (#1863), or why there is none to send.
 * `nextSeason` when that week runs past the end of the season the map holds:
 * the next season's lessons are not in this payload, so a message for that
 * week would leave them out — and on the evening a restart is announced,
 * "nothing planned" would be wrong.
 */
export type PublishedWeek =
  | { readonly kind: 'week'; readonly week: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'nextSeason' };

/**
 * This week while it still has a plan ahead, and the next one once it has
 * not — the Sunday-evening message, sent when this week's lessons are behind
 * it. Never further out: a message about a later week is not "the week's
 * plan". `now` is the local time as `HH:MM` ({@link clockOf}).
 */
export function publishedWeek(calendar: SyllabusCalendar, now: string): PublishedWeek {
  const thisWeek = mondayOf(calendar.today);

  for (const week of [thisWeek, addDays(thisWeek, 7)]) {
    if (addDays(week, 6) > calendar.season.end) return { kind: 'nextSeason' };
    if (aheadIn(calendar, week, now).length > 0) return { kind: 'week', week };
  }
  return { kind: 'none' };
}

/**
 * The week's plan as plain text for the academy's group (#1863): a heading,
 * then one line per planned lesson — day, class, and what it covers, each
 * technique under its position.
 *
 * Lessons still ahead only. One somebody was checked into already happened,
 * one nobody confirmed is not a plan any more, and today's is not news once
 * it has started — though it stays "planned" until a check-in. The names are
 * the programme's own words, never translated; only the heading and the
 * weekday come from the reader's language. Null when nothing is ahead.
 */
export function weekPlanText(
  calendar: SyllabusCalendar,
  week: string,
  now: string,
  labels: WeekPlanLabels,
): string | null {
  const lessons = [...aheadIn(calendar, week, now)].sort(byDayThenTime);
  if (lessons.length === 0) return null;

  const lines = lessons.map((lesson) =>
    [dayLabel(lesson.held_on, labels), lesson.name, topicsLine(calendar, lesson)].join(' · '),
  );
  return [labels.heading, ...lines].join('\n');
}

function aheadIn(calendar: SyllabusCalendar, week: string, now: string): CalendarLesson[] {
  return calendar.lessons.filter(
    (lesson) => mondayOf(lesson.held_on) === week && isAhead(lesson, calendar.today, now),
  );
}

/**
 * Planned, and not started yet. A plan is dated today or later, so only
 * today's needs the clock; one with no time stays ahead, since nothing says
 * it is over.
 */
function isAhead(lesson: CalendarLesson, today: string, now: string): boolean {
  if (lesson.state !== 'planned') return false;
  if (lesson.held_on !== today || lesson.starts_at === null) return true;
  return lesson.starts_at > now;
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

/** The local time as `HH:MM`, the shape of a lesson's `starts_at`. */
export function clockOf(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
