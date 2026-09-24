/*
 * The harness's fixtures, held to the server's current rules (#1854).
 *
 * The audit paints whatever its stubs say. When a stub drifts behind a server
 * rule, the screenshot shows a number the product cannot produce ("143/8" on
 * the roster, "50%" beside "5 of 6"), and a reader files it as a finding. That
 * happened twice in one run. So every stub body is checked against the rules
 * below as it is registered, and a contradiction fails the screen before the
 * shutter.
 *
 * The rules are keyed on the contract's field names, not on which fixture
 * carries them, so a screen added by any track is covered the moment it
 * stubs one of these shapes. Each rule names the server code it mirrors.
 */

export interface FixtureContext {
  /** The frozen "today" of the harness, `YYYY-MM-DD`. */
  today: string;
  /** The first day of the current season, `YYYY-MM-DD`. */
  seasonStart: string;
  /** The academy's training weekdays, 0 = Sunday … 6 = Saturday. */
  trainingDays: readonly number[];
  /** How many athletes the roster holds. */
  rosterSize: number;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const day = (iso: string): string => iso.slice(0, 10);
const later = (a: string, b: string): string => (a > b ? a : b);

/** Training days from `from` to `to`, both included: the roster's denominator. */
export function trainingDaysBetween(from: string, to: string, days: readonly number[]): number {
  let count = 0;
  const [fy, fm, fd] = day(from).split('-').map(Number);
  const [ty, tm, td] = day(to).split('-').map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (cursor <= end) {
    if (days.includes(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

type Rule = (o: Obj, ctx: FixtureContext) => string[];

const RULES: Rule[] = [
  // The roster's two fractions (#1455, #1484): the month and the SEASON, each
  // over the training days since the later of its start and joining.
  (o, ctx) => {
    const out: string[] = [];
    if (!isDate(o['joined_at'])) return out;
    const joined = day(o['joined_at']);
    const monthStart = `${ctx.today.slice(0, 7)}-01`;
    const seasonDays = trainingDaysBetween(later(ctx.seasonStart, joined), ctx.today, ctx.trainingDays);
    const monthDays = trainingDaysBetween(later(monthStart, joined), ctx.today, ctx.trainingDays);
    const total = o['attendance_total_count'];
    const month = o['attendance_month_count'];
    if (isNum(total) && total > seasonDays) {
      out.push(`attendance_total_count ${total} > ${seasonDays} training days this season`);
    }
    if (isNum(month) && month > monthDays) {
      out.push(`attendance_month_count ${month} > ${monthDays} training days this month`);
    }
    if (isNum(month) && isNum(total) && ctx.seasonStart <= monthStart && month > total) {
      out.push(`attendance_month_count ${month} > attendance_total_count ${total}`);
    }
    // Last presence (#1726): a real day, after joining and not after today.
    const last = o['last_attended_on'];
    if (isDate(last) && (day(last) < joined || day(last) > ctx.today)) {
      out.push(`last_attended_on ${last} outside ${joined}…${ctx.today}`);
    }
    return out;
  },

  // An athlete's programme (AthleteSyllabusCoverageAction, #1723): attended is
  // seen + thin, attended + missed is what the academy taught, and the
  // headline is attended over taught.
  (o) => {
    const out: string[] = [];
    const { taught_by_academy: taught, attended, seen, thin, missed, percentage } = o;
    if (!isNum(taught) || !isNum(attended)) return out;
    if (attended > taught) out.push(`attended ${attended} > taught_by_academy ${taught}`);
    if (isNum(seen) && isNum(thin) && seen + thin !== attended) {
      out.push(`seen ${seen} + thin ${thin} ≠ attended ${attended}`);
    }
    if (isNum(missed) && attended + missed !== taught) {
      out.push(`attended ${attended} + missed ${missed} ≠ taught_by_academy ${taught}`);
    }
    const expected = taught === 0 ? 0 : Math.round((attended / taught) * 100);
    if (isNum(percentage) && percentage !== expected) {
      out.push(`percentage ${percentage} ≠ attended/taught ${expected}`);
    }
    return out;
  },

  // The academy's programme (SyllabusCoverageAction): three states that sum to
  // what is in scope, and a headline of covered over in scope.
  (o) => {
    const out: string[] = [];
    const { in_scope: scope, covered, thin, missing, percentage } = o;
    if (!isNum(scope) || !isNum(covered)) return out;
    if (covered > scope) out.push(`covered ${covered} > in_scope ${scope}`);
    if (isNum(thin) && isNum(missing) && covered + thin + missing !== scope) {
      out.push(`covered ${covered} + thin ${thin} + missing ${missing} ≠ in_scope ${scope}`);
    }
    const expected = scope === 0 ? 0 : Math.round((covered / scope) * 100);
    if (isNum(percentage) && percentage !== expected) {
      out.push(`percentage ${percentage} ≠ covered/in_scope ${expected}`);
    }
    return out;
  },

  // Who has seen a technique (TopicExposureAction, #1745): the buckets hold
  // the people listed, nobody was at more lessons than were held, and a state
  // agrees with its count (seen ≥ 2, thin = 1, never and unplaced = 0).
  (o) => {
    const out: string[] = [];
    const lessons = o['lessons'];
    const athletes = o['athletes'];
    const totals = o['totals'];
    if (!Array.isArray(lessons) || !Array.isArray(athletes) || !isObj(totals)) return out;
    if (isNum(totals['lessons']) && totals['lessons'] !== lessons.length) {
      out.push(`totals.lessons ${totals['lessons']} ≠ ${lessons.length} lessons listed`);
    }
    const buckets = ['seen', 'thin', 'never', 'unplaced'].map((k) => totals[k]).filter(isNum);
    const sum = buckets.reduce((a, b) => a + b, 0);
    if (buckets.length > 0 && sum !== athletes.length) {
      out.push(`totals buckets sum to ${sum}, but ${athletes.length} athletes are listed`);
    }
    for (const a of athletes.filter(isObj)) {
      const n = a['exposures'];
      const state = a['state'];
      if (!isNum(n)) continue;
      if (n > lessons.length) out.push(`athlete ${a['id']} exposures ${n} > ${lessons.length} lessons`);
      const agrees =
        (state === 'seen' && n >= 2) ||
        (state === 'thin' && n === 1) ||
        ((state === 'never' || state === 'unplaced') && n === 0);
      if (typeof state === 'string' && !agrees) {
        out.push(`athlete ${a['id']} is '${state}' with ${n} exposures`);
      }
    }
    return out;
  },

  // A lesson's headcount is people on the roster.
  (o, ctx) =>
    isNum(o['headcount']) && o['headcount'] > ctx.rosterSize
      ? [`headcount ${o['headcount']} > roster of ${ctx.rosterSize}`]
      : [],

  // A carnet (#1364): never more left than it was sold with.
  (o) =>
    isNum(o['remaining_entries']) &&
    isNum(o['total_entries']) &&
    o['remaining_entries'] > o['total_entries']
      ? [`remaining_entries ${o['remaining_entries']} > total_entries ${o['total_entries']}`]
      : [],

  // An athlete's attendance summary (#893): attended out of expected.
  (o) =>
    isNum(o['attended_count']) &&
    isNum(o['expected_count']) &&
    o['attended_count'] > o['expected_count']
      ? [`attended_count ${o['attended_count']} > expected_count ${o['expected_count']}`]
      : [],

  // A month-summary row (#1765) counts days: no more than the month has had.
  (o, ctx) => {
    if (!isNum(o['athlete_id']) || !isNum(o['count']) || !('first_name' in o)) return [];
    const monthStart = `${ctx.today.slice(0, 7)}-01`;
    const monthDays = trainingDaysBetween(monthStart, ctx.today, ctx.trainingDays);
    return o['count'] > monthDays ? [`summary count ${o['count']} > ${monthDays} days this month`] : [];
  },
];

/**
 * Every contradiction in a stub body, each with the path it was found at.
 * Walks the whole value, so a rule applies wherever its shape appears.
 */
export function fixtureContradictions(body: unknown, ctx: FixtureContext, path = '$'): string[] {
  if (Array.isArray(body)) {
    return body.flatMap((item, i) => fixtureContradictions(item, ctx, `${path}[${i}]`));
  }
  if (!isObj(body)) return [];
  const here = RULES.flatMap((rule) => rule(body, ctx)).map((p) => `${path}: ${p}`);
  const below = Object.entries(body).flatMap(([k, v]) => fixtureContradictions(v, ctx, `${path}.${k}`));
  return [...here, ...below];
}

