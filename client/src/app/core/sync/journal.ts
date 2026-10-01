import { isDeviceId } from './layout';
import { isRecord, isUtcTimestamp, ok, Parsed, refuse } from './parse';

/**
 * One write the device made through its API, as the server records it (#2031)
 * and the rebase replays it (PRD § 5.2). **The journal records API writes, not
 * rows:** replaying runs the same Actions with the same validation, so a change
 * the rules would refuse is refused again, and becomes a question for the owner.
 *
 * This shape is a contract with the server, which writes the entries, and it is
 * documented in `docs/api/v1.yaml` with the endpoint that serves them (#2031).
 */
export interface JournalEntry {
  /** A ULID: unique across devices, and sorted by time. */
  id: string;
  device: string;
  /** When the device made the write, in UTC. */
  at: string;
  method: JournalMethod;
  /** The Laravel route name, `attendance.store`: stable when a URL is not. */
  route: string;
  /** The route's parameters, `{ athlete: 57 }`. The rebase maps the ids among them. */
  params: Record<string, string | number>;
  /** The request body, or null for a write without one. */
  body: Record<string, unknown> | null;
  /** The ids the write created, by table: `{ athletes: [57] }`. Empty when it created none. */
  created: Record<string, number[]>;
  /** For an update or a delete, the values it saw before, which is how the rebase spots a conflict. */
  before: Record<string, unknown> | null;
}

export const JOURNAL_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type JournalMethod = (typeof JOURNAL_METHODS)[number];

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ROUTE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const KEYS: (keyof JournalEntry)[] = [
  'id',
  'device',
  'at',
  'method',
  'route',
  'params',
  'body',
  'created',
  'before',
];

export function parseJournalEntry(value: unknown): Parsed<JournalEntry> {
  if (!isRecord(value)) {
    return refuse('an entry is an object');
  }
  const missing = KEYS.find((key) => !(key in value));
  if (missing !== undefined) {
    return refuse(`an entry has no ${missing}`);
  }
  if (typeof value['id'] !== 'string' || !ULID.test(value['id'])) {
    return refuse('the id is not a ULID');
  }
  if (!isDeviceId(value['device'])) {
    return refuse('the device is not a device id');
  }
  if (!isUtcTimestamp(value['at'])) {
    return refuse('the time is not a UTC timestamp');
  }
  if (!JOURNAL_METHODS.includes(value['method'] as JournalMethod)) {
    return refuse('the method is not a write');
  }
  if (typeof value['route'] !== 'string' || !ROUTE.test(value['route'])) {
    return refuse('the route is not a route name');
  }
  const params = value['params'];
  if (
    !isRecord(params) ||
    !Object.values(params).every((param) => typeof param === 'string' || typeof param === 'number')
  ) {
    return refuse('the parameters are not strings and numbers');
  }
  if (value['body'] !== null && !isRecord(value['body'])) {
    return refuse('the body is not an object');
  }
  const created = value['created'];
  if (
    !isRecord(created) ||
    !Object.values(created).every(
      (ids) => Array.isArray(ids) && ids.every((id) => Number.isInteger(id) && (id as number) > 0),
    )
  ) {
    return refuse('the created ids are not lists of ids');
  }
  if (value['before'] !== null && !isRecord(value['before'])) {
    return refuse('what it saw before is not an object');
  }

  return ok({
    id: value['id'],
    device: value['device'],
    at: value['at'],
    method: value['method'] as JournalMethod,
    route: value['route'],
    params: params as Record<string, string | number>,
    body: value['body'] as Record<string, unknown> | null,
    created: created as Record<string, number[]>,
    before: value['before'] as Record<string, unknown> | null,
  });
}

/** A whole journal, in order. The first bad entry refuses it, by its position. */
export function parseJournal(value: unknown): Parsed<JournalEntry[]> {
  if (!Array.isArray(value)) {
    return refuse('a journal is a list');
  }
  const entries: JournalEntry[] = [];
  for (const [index, item] of value.entries()) {
    const entry = parseJournalEntry(item);
    if (!entry.ok) {
      return refuse(`entry ${index + 1}: ${entry.reason}`);
    }
    if (entries.length > 0 && entry.value.id <= entries[entries.length - 1].id) {
      return refuse(`entry ${index + 1}: out of order`);
    }
    entries.push(entry.value);
  }
  return ok(entries);
}
