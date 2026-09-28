import type { AcademyClass } from '../../core/services/academy-class.service';
import type { AcademyClosure } from '../../core/services/academy.service';
import { CalendarLesson, SyllabusCalendar } from '../../core/services/stats.service';
import { addDays, mondayOf } from './class-occurrences';

/** The words the message needs that are not the programme's own. */
export interface WeekMessageLabels {
  readonly heading: string;
  /** Short weekday names, Monday first. */
  readonly weekdays: readonly string[];
  /** "chiuso", after a day's name. */
  readonly closed: string;
  /** "Chiuso fino al 6 gennaio": the one line for a closure over the rest of the week. */
  readonly closedUntil: (lastDay: string) => string;
}

/**
 * The academy's week as the timetable has it (#1940): its classes, and the
 * days it is shut. Without one, the message is the planned lessons alone,
 * the way #1863 first wrote it.
 */
export interface WeekSchedule {
  readonly classes: readonly AcademyClass[];
  readonly closures: readonly AcademyClosure[];
}

/** A position, and what the lesson does from it. */
interface TopicGroup {
  readonly name: string;
  readonly techniques: string[];
}

/** One class on one day of the week, and its lesson when there is one. */
interface Slot {
  readonly day: string;
  readonly startsAt: string | null;
  readonly name: string;
  readonly lesson: CalendarLesson | null;
  /** Tie-break for two classes at the same time: the class, else the lesson. */
  readonly order: number;
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
 * This week while it still has something ahead, and the next one once it has
 * not — the Sunday-evening message, sent when this week's classes are behind
 * it. Never further out: a message about a later week is not "the week's
 * plan". `now` is the local time as `HH:MM` ({@link clockOf}).
 *
 * With the timetable (#1940), "something ahead" is a class still to come or a
 * closed day that would have had one: a week entirely closed is exactly the
 * news the group needs. Without it, it is a planned lesson, as in #1863.
 */
export function publishedWeek(
  calendar: SyllabusCalendar,
  now: string,
  schedule: WeekSchedule | null = null,
): PublishedWeek {
  for (const week of weeksAhead(calendar)) {
    if (addDays(week, 6) > calendar.season.end) return { kind: 'nextSeason' };
    if (weekLines(calendar, week, now, schedule).length > 0) return { kind: 'week', week };
  }
  return { kind: 'none' };
}

/**
 * The week the timetable sends (#1940), by the same rule — this week while
 * it has something ahead, else the next — but across the end of the season.
 * The map stops there because the message it sends is the plan, and the next
 * season's plan is not in its payload; the timetable's message is the classes
 * and the closed days, which do not end with a season. A season ends on a
 * month's last day, so its restart week usually crosses it: on that Sunday
 * evening, "we restart Monday at 19:00" is the one message the group needs.
 * The new season's days go out without topics. Null with nothing on either
 * week.
 */
export function timetableWeek(
  calendar: SyllabusCalendar,
  now: string,
  schedule: WeekSchedule,
): string | null {
  return (
    weeksAhead(calendar).find((week) => weekLines(calendar, week, now, schedule).length > 0) ?? null
  );
}

/** This week and the next, Mondays: never further out than "the week's plan". */
function weeksAhead(calendar: SyllabusCalendar): string[] {
  const thisWeek = mondayOf(calendar.today);
  return [thisWeek, addDays(thisWeek, 7)];
}

/**
 * The week as plain text for the academy's group (#1863, #1940): a heading,
 * then one line per class still ahead — day, time, class, and what it covers
 * when planned, each technique under its position — with a closed day as one
 * "chiuso" line in place of its classes.
 *
 * Classes still ahead only: one somebody was checked into already happened,
 * and today's is not news once it has started. The names are the programme's
 * own words, never translated; only the heading, the weekdays and "chiuso"
 * come from the reader's language. Null when nothing is ahead.
 */
export function weekMessageText(
  calendar: SyllabusCalendar,
  week: string,
  now: string,
  labels: WeekMessageLabels,
  schedule: WeekSchedule | null = null,
): string | null {
  const lines = weekLines(calendar, week, now, schedule, labels);
  return lines.length === 0 ? null : [labels.heading, ...lines].join('\n');
}

/** The body of the message; without labels, only whether there is one. */
function weekLines(
  calendar: SyllabusCalendar,
  week: string,
  now: string,
  schedule: WeekSchedule | null,
  labels: WeekMessageLabels | null = null,
): string[] {
  if (schedule !== null) {
    const shut = closureUntil(schedule, classDaysAhead(schedule, week, calendar.today, now));
    if (shut !== null) {
      return labels === null ? [shut.lastDay] : [closedWeekLine(shut, labels)];
    }
  }

  const slots = slotsOf(calendar, week, now, schedule).sort(bySlot);
  const lines: string[] = [];
  const closedPrinted = new Set<string>();
  for (const slot of slots) {
    const closure = schedule === null ? null : closureOn(schedule.closures, slot.day);
    if (closure !== null) {
      if (closedPrinted.has(slot.day)) continue;
      closedPrinted.add(slot.day);
      lines.push(labels === null ? slot.day : closedDayLine(slot.day, closure, labels));
      continue;
    }
    lines.push(labels === null ? slot.day : slotLine(calendar, slot, labels));
  }
  return lines;
}

/**
 * Every class of the week still ahead, each with its lesson, plus a planned
 * lesson that belongs to no class of the timetable. Without a timetable, the
 * planned lessons alone.
 */
function slotsOf(
  calendar: SyllabusCalendar,
  week: string,
  now: string,
  schedule: WeekSchedule | null,
): Slot[] {
  const lessons = calendar.lessons.filter((lesson) => mondayOf(lesson.held_on) === week);

  if (schedule === null) {
    return lessons
      .filter(
        (lesson) =>
          lesson.state === 'planned' &&
          isAhead(lesson.held_on, lesson.starts_at, calendar.today, now),
      )
      .map((lesson) => slotOfLesson(lesson));
  }

  const slots: Slot[] = [];
  const claimed = new Set<number>();
  for (const day of weekDays(week)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    for (const klass of schedule.classes.filter((c) => c.weekday === weekday)) {
      const lesson =
        lessons.find((l) => l.academy_class_id === klass.id && l.held_on === day) ?? null;
      if (lesson !== null) claimed.add(lesson.id);
      // A lesson somebody was checked into, or one the owner left unconfirmed,
      // already happened.
      if (lesson !== null && lesson.state !== 'planned') continue;
      if (!isAhead(day, klass.starts_at, calendar.today, now)) continue;
      slots.push({
        day,
        startsAt: klass.starts_at,
        name: klass.name,
        lesson,
        order: klass.id,
      });
    }
  }

  // A planned lesson outside the timetable (a class since removed, a
  // one-off seminar) is still on the week.
  for (const lesson of lessons) {
    if (claimed.has(lesson.id) || lesson.state !== 'planned') continue;
    if (!isAhead(lesson.held_on, lesson.starts_at, calendar.today, now)) continue;
    slots.push(slotOfLesson(lesson));
  }
  return slots;
}

function slotOfLesson(lesson: CalendarLesson): Slot {
  return {
    day: lesson.held_on,
    startsAt: lesson.starts_at,
    name: lesson.name,
    lesson,
    order: Number.MAX_SAFE_INTEGER - 1_000_000 + lesson.id,
  };
}

/**
 * Not started yet. Only today needs the clock; a class with no time stays
 * ahead, since nothing says it is over.
 */
function isAhead(day: string, startsAt: string | null, today: string, now: string): boolean {
  if (day !== today) return day > today;
  return startsAt === null || startsAt > now;
}

/** Day, then time; a class with no time after those that have one. */
function bySlot(a: Slot, b: Slot): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  const at = a.startsAt ?? '99:99';
  const bt = b.startsAt ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.order - b.order;
}

/** "Lun 14 · 19:00 Fondamentali · Closed guard: Armbar". */
function slotLine(calendar: SyllabusCalendar, slot: Slot, labels: WeekMessageLabels): string {
  const name = slot.startsAt === null ? slot.name : `${slot.startsAt} ${slot.name}`;
  const topics = slot.lesson === null ? '' : topicsLine(calendar, slot.lesson);
  return [dayLabel(slot.day, labels), name, ...(topics === '' ? [] : [topics])].join(' · ');
}

/** "Mar 8 · chiuso — Immacolata". */
function closedDayLine(day: string, closure: AcademyClosure, labels: WeekMessageLabels): string {
  const closed = `${dayLabel(day, labels)} · ${labels.closed}`;
  return closure.label === null || closure.label === '' ? closed : `${closed} — ${closure.label}`;
}

/** "Chiuso fino al 6 gennaio — Vacanze". */
function closedWeekLine(
  shut: { lastDay: string; label: string | null },
  labels: WeekMessageLabels,
): string {
  const line = labels.closedUntil(shut.lastDay);
  return shut.label === null || shut.label === '' ? line : `${line} — ${shut.label}`;
}

/** The closure covering a day, if any. */
function closureOn(closures: readonly AcademyClosure[], day: string): AcademyClosure | null {
  return closures.find((c) => c.starts_on <= day && day <= c.ends_on) ?? null;
}

/**
 * The days of the week still ahead that have a class on the timetable — the
 * days a closure is news for. A day with no class, or today once its last
 * class has started, is not.
 */
function classDaysAhead(
  schedule: WeekSchedule,
  week: string,
  today: string,
  now: string,
): string[] {
  return weekDays(week).filter((day) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return schedule.classes.some(
      (klass) => klass.weekday === weekday && isAhead(day, klass.starts_at, today, now),
    );
  });
}

/**
 * One closure covering every class day left in the week — the holidays, the
 * summer break, a Monday-to-Friday bridge on a Monday-to-Friday timetable:
 * then the message is one line, not a "chiuso" per day. Measured against the
 * last class day, not Sunday: a closure ending on Friday shuts a week with no
 * weekend classes all the same. A single class day left stays a day line:
 * "Ven 16 · chiuso — Festa" says more than "chiuso fino al 16". Null when any
 * of those days is open.
 */
function closureUntil(
  schedule: WeekSchedule,
  days: readonly string[],
): { lastDay: string; label: string | null } | null {
  if (days.length < 2) return null;
  const first = days[0];
  const last = days[days.length - 1];
  const covering = schedule.closures.find((c) => c.starts_on <= first && last <= c.ends_on);
  return covering === undefined ? null : { lastDay: covering.ends_on, label: covering.label };
}

/** The seven days of a week, Monday first, as `YYYY-MM-DD`. */
function weekDays(week: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i));
}

/** "Mer 14". */
function dayLabel(iso: string, labels: WeekMessageLabels): string {
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

/** The local time as `HH:MM`, the shape of a lesson's `starts_at`. */
export function clockOf(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
