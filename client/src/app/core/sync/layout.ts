/**
 * Where everything lives in the sync folder (PRD § 5.2–5.4, #2029). Every path
 * is also the envelope's associated data, so these names are part of the
 * cryptography: a file only opens under the path it was sealed for.
 *
 * ```
 * Budojo/sync/
 *   keys.bjs                     the app keys, sealed under the sync key (§ 5.4)
 *   versions/000042-pc4f.bjs     a version: manifest, journal, database
 *   files/<sha256>.bjs           a document or photo, named by its content
 *   devices/pc4f.bjs             what a device last saw and sent
 * ```
 */

export const KEYS_PATH = 'keys.bjs';

/**
 * A device's id: a word for the kind of device and four random characters,
 * `pc4f2a` or `phone9c1e`. It names the device's versions, so it must be
 * short, safe in a file name, and different on two phones of one academy.
 */
const DEVICE = /^[a-z]{2,8}[0-9a-z]{4}$/;

/** Six digits, as PRD § 5.2 draws them: a million versions is centuries of syncing. */
const SEQ_DIGITS = 6;
export const MAX_SEQ = 10 ** SEQ_DIGITS - 1;

const VERSION = /^versions\/(\d{6})-([a-z0-9]+)\.bjs$/;
const FILE = /^files\/([0-9a-f]{64})\.bjs$/;

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE.test(value);
}

/** A new id for this device, made once at pairing and kept. */
export function newDeviceId(kind: string): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    (byte % 36).toString(36),
  ).join('');
  const id = `${kind}${suffix}`;
  if (!isDeviceId(id)) {
    throw new Error(`"${kind}" cannot start a device id`);
  }
  return id;
}

export function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SEQ;
}

export interface VersionRef {
  seq: number;
  device: string;
}

export function versionPath(version: VersionRef): string {
  if (!isSeq(version.seq) || !isDeviceId(version.device)) {
    throw new Error(`no path for version ${version.seq} of ${version.device}`);
  }
  return `versions/${String(version.seq).padStart(SEQ_DIGITS, '0')}-${version.device}.bjs`;
}

/** The version a path names, or null for anything else in the folder. */
export function parseVersionPath(path: string): VersionRef | null {
  const match = VERSION.exec(path);
  if (match === null) {
    return null;
  }
  const version = { seq: Number(match[1]), device: match[2] };
  return isSeq(version.seq) && isDeviceId(version.device) ? version : null;
}

export function filePath(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('a file is named by its lowercase SHA-256');
  }
  return `files/${sha256}.bjs`;
}

export function parseFilePath(path: string): string | null {
  return FILE.exec(path)?.[1] ?? null;
}

export function devicePath(device: string): string {
  if (!isDeviceId(device)) {
    throw new Error(`"${device}" is not a device id`);
  }
  return `devices/${device}.bjs`;
}
