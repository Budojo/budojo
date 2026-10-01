/**
 * Validation for what the sync reads back from Drive (#2029). Everything that
 * comes out of an envelope was written by another device, possibly by another
 * version of the app, so each reader checks it and refuses with a reason the
 * sync state can show, rather than half-trusting a malformed file.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

export function ok<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

export function refuse<T>(reason: string): Parsed<T> {
  return { ok: false, reason };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A UTC timestamp as Laravel and `Date#toISOString` write it, up to
 * microseconds. `Date.parse` alone would take 31 February as 3 March, so the
 * date it reads must have the fields it was given.
 */
export function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?Z$/.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
