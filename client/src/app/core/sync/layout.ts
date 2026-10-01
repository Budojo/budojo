/**
 * Where everything lives in the sync folder (PRD § 5.2–5.4, #2029). Every path
 * is also the envelope's associated data, so these names are part of the
 * cryptography: a file only opens under the path it was sealed for.
 *
 * ```
 * Budojo/sync/
 *   keys.bjs                                  the app keys, sealed under the sync key (§ 5.4)
 *   versions/000045-phone9c1e.000044-pc4f2a.bjs  version 45, made on top of 44-pc4f2a
 *   versions/000001-pc4f2a.root.bjs           an academy's first version
 *   files/<sha256>.bjs                        a document or photo, named by its content
 *   devices/pc4f2a.bjs                        what a device last saw and sent
 * ```
 *
 * **A version's name carries its parent,** so the whole history can be read
 * from the folder's listing, with no database downloaded. That is what lets a
 * device tell "my version is on the line" from "my version lost a race"
 * (`decide.ts`). Being in the name, the parent is also bound by the envelope.
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

const REF = '(\\d{6})-([a-z0-9]+)';
const VERSION = new RegExp(`^versions/${REF}\\.(?:${REF}|root)\\.bjs$`);
const FILE = /^files\/([0-9a-f]{64})\.bjs$/;
const DEVICE_FILE = /^devices\/([a-z0-9]+)\.bjs$/;

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

/** One version: its number and the device that wrote it. Two devices can hold the same number. */
export interface VersionRef {
  seq: number;
  device: string;
}

/** A version as the folder lists it: itself and the version it was made on top of. */
export interface ListedVersion extends VersionRef {
  parent: VersionRef | null;
}

export function isVersionRef(value: unknown): value is VersionRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    isSeq((value as VersionRef).seq) &&
    isDeviceId((value as VersionRef).device)
  );
}

export function sameVersion(a: VersionRef | null, b: VersionRef | null): boolean {
  return a !== null && b !== null && a.seq === b.seq && a.device === b.device;
}

function ref(version: VersionRef): string {
  return `${String(version.seq).padStart(SEQ_DIGITS, '0')}-${version.device}`;
}

export function versionPath(version: ListedVersion): string {
  const { parent } = version;
  if (
    !isVersionRef(version) ||
    (parent !== null && !(isVersionRef(parent) && parent.seq < version.seq))
  ) {
    throw new Error(`no path for version ${version.seq} of ${version.device}`);
  }
  return `versions/${ref(version)}.${parent === null ? 'root' : ref(parent)}.bjs`;
}

/** The version a path names, with its parent, or null for anything else in the folder. */
export function parseVersionPath(path: string): ListedVersion | null {
  const match = VERSION.exec(path);
  if (match === null) {
    return null;
  }
  const version = { seq: Number(match[1]), device: match[2] };
  const parent = match[3] === undefined ? null : { seq: Number(match[3]), device: match[4] };
  const valid =
    isVersionRef(version) &&
    (parent === null || (isVersionRef(parent) && parent.seq < version.seq));
  return valid ? { ...version, parent } : null;
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

/** Whether a path is one the protocol defines: a remote reads and writes nothing else. */
export function isLayoutPath(path: string): boolean {
  if (path === KEYS_PATH || parseVersionPath(path) !== null || parseFilePath(path) !== null) {
    return true;
  }
  const device = DEVICE_FILE.exec(path)?.[1];
  return device !== undefined && isDeviceId(device);
}
