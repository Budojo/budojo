import { isDeviceId, isVersionRef, VersionRef } from './layout';
import { isRecord, isUtcTimestamp, ok, Parsed, refuse } from './parse';

/**
 * `devices/<id>.bjs` (#2029): what one device last saw and holds, written by it
 * after every sync, and **the only ground on which a write leaves a journal.**
 *
 * A device keeps each write of its own until **every other device reports
 * holding it**. From then on every database holds the write, so every version
 * built from now on does too, and no fast-forward can drop it. No clock is
 * involved: an upload that resumes days later cannot outrun this rule, as it
 * could a time limit.
 *
 * `holds` is enough because each device's entries are ULIDs that only grow, and
 * a database always holds a prefix of each device's entries: they reach it in
 * order, by its own writes, a fast-forward, or a replay. So "the newest entry of
 * device D this database holds" says which of D's entries it holds.
 */
export interface DeviceReport {
  device: string;
  /** The version its database is at, or null before its first sync. */
  base: VersionRef | null;
  /** For each device, the newest of that device's journal entries its database holds. */
  holds: Record<string, string>;
  /** When it wrote the report, in UTC. */
  at: string;
}

const VERSION = 1;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export function serializeDeviceReport(report: DeviceReport): Record<string, unknown> {
  return { v: VERSION, ...report };
}

export function parseDeviceReport(value: unknown): Parsed<DeviceReport> {
  if (!isRecord(value)) {
    return refuse('a device report is an object');
  }
  if (value['v'] !== VERSION) {
    return refuse(`device report version ${String(value['v'])} is not supported`);
  }
  if (!isDeviceId(value['device'])) {
    return refuse('the device is not a device id');
  }
  const base = value['base'];
  if (base !== null && !isVersionRef(base)) {
    return refuse('the base is not a version');
  }
  const holds = value['holds'];
  if (
    !isRecord(holds) ||
    !Object.entries(holds).every(
      ([device, ulid]) => isDeviceId(device) && typeof ulid === 'string' && ULID.test(ulid),
    )
  ) {
    return refuse('what it holds is not a ULID per device');
  }
  if (!isUtcTimestamp(value['at'])) {
    return refuse('the time is not a UTC timestamp');
  }
  return ok({
    device: value['device'],
    base: base === null ? null : { seq: base.seq, device: base.device },
    holds: holds as Record<string, string>,
    at: value['at'],
  });
}

/**
 * Up to which of its own entries `self` may clear: the newest entry that every
 * other device's report says it holds. Its entries up to that one, inclusive,
 * may leave the journal.
 *
 * - `everything` when no other device reports at all: there is nobody to race,
 *   and a device that pairs later starts from the latest version.
 * - `null` when some other device holds none of them yet: nothing may go.
 */
export function confirmedThrough(
  self: string,
  reports: readonly DeviceReport[],
): string | 'everything' | null {
  const others = reports.filter((report) => report.device !== self);
  if (others.length === 0) {
    return 'everything';
  }
  let through: string | null = null;
  for (const report of others) {
    const held = report.holds[self];
    if (held === undefined) {
      return null;
    }
    if (through === null || held < through) {
      through = held;
    }
  }
  return through;
}
