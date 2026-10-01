import { concat, fromUtf8, sha256Hex, utf8 } from './bytes';
import { JournalEntry, parseJournal } from './journal';
import { isDeviceId, isSeq, isVersionRef, ListedVersion, sameVersion, VersionRef } from './layout';
import { isRecord, isSha256, isUtcTimestamp, ok, Parsed, refuse } from './parse';

/**
 * A version (PRD § 5.2): the whole database, the journal of the writes that made
 * it from its parent, and a manifest that says what it is. One file, written
 * once under a new name and never rewritten.
 *
 * Inside the envelope:
 *
 * ```
 * u32 manifest length | manifest (JSON) | u32 journal length | journal (JSON) | database
 * ```
 */

export const PROTOCOL = 2;

export interface VersionManifest {
  protocol: typeof PROTOCOL;
  seq: number;
  /** The version this one was made on top of, as its file name also says; null for an academy's first. */
  parent: VersionRef | null;
  device: string;
  /** The newest migration the database has run (PRD § 5.5): a device never opens a newer one. */
  schema: string;
  /** The app version that wrote it. */
  app: string;
  /** SHA-256 of the journal's bytes as stored in the file. */
  journalSha256: string;
  createdAt: string;
}

export interface Version {
  manifest: VersionManifest;
  journal: JournalEntry[];
  database: Uint8Array;
}

const MIGRATION = /^\d{4}_\d{2}_\d{2}_\d{6}_[a-z0-9_]+$/;
const APP_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Strict on every field it knows, and silent about any it does not: a later app
 * may add a field to protocol 2, and an older one must still read the rest.
 * Anything that changes what a field means is a new protocol number instead.
 */
export function parseManifest(value: unknown): Parsed<VersionManifest> {
  if (!isRecord(value)) {
    return refuse('a manifest is an object');
  }
  if (value['protocol'] !== PROTOCOL) {
    return refuse(`protocol ${String(value['protocol'])}, this app reads ${PROTOCOL}`);
  }
  if (!isSeq(value['seq'])) {
    return refuse('the sequence number is not a version number');
  }
  const parent = value['parent'];
  if (parent !== null && !(isVersionRef(parent) && parent.seq < value['seq'])) {
    return refuse('the parent is not an earlier version');
  }
  if (!isDeviceId(value['device'])) {
    return refuse('the device is not a device id');
  }
  if (typeof value['schema'] !== 'string' || !MIGRATION.test(value['schema'])) {
    return refuse('the schema is not a migration name');
  }
  if (typeof value['app'] !== 'string' || !APP_VERSION.test(value['app'])) {
    return refuse('the app version is not a version');
  }
  if (!isSha256(value['journalSha256'])) {
    return refuse('the journal digest is not a SHA-256');
  }
  if (!isUtcTimestamp(value['createdAt'])) {
    return refuse('the creation time is not a UTC timestamp');
  }

  return ok({
    protocol: PROTOCOL,
    seq: value['seq'],
    parent: parent === null ? null : { seq: parent.seq, device: parent.device },
    device: value['device'],
    schema: value['schema'],
    app: value['app'],
    journalSha256: value['journalSha256'],
    createdAt: value['createdAt'],
  });
}

function u32(length: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length);
  return bytes;
}

/**
 * The file's plaintext, with the journal digest filled in. The manifest and the
 * journal are checked first, with the readers' own rules, so a device cannot
 * publish a version it, or any other, could not read back.
 */
export async function packVersion(
  manifest: Omit<VersionManifest, 'journalSha256'>,
  journal: JournalEntry[],
  database: Uint8Array,
): Promise<Uint8Array> {
  const journalBytes = utf8(JSON.stringify(journal));
  const journalChecked = parseJournal(JSON.parse(JSON.stringify(journal)) as unknown);
  if (!journalChecked.ok) {
    throw new Error(`refusing to pack a version: journal: ${journalChecked.reason}`);
  }
  const complete = { ...manifest, journalSha256: await sha256Hex(journalBytes) };
  const checked = parseManifest(complete);
  if (!checked.ok) {
    throw new Error(`refusing to pack a version: ${checked.reason}`);
  }
  const manifestBytes = utf8(JSON.stringify(checked.value));

  return concat(
    u32(manifestBytes.length),
    manifestBytes,
    u32(journalBytes.length),
    journalBytes,
    database,
  );
}

/**
 * Reads a version's plaintext back. `expected` is what the file's path says it
 * is: the envelope already binds the path, and this also holds the manifest to it.
 */
export async function unpackVersion(
  bytes: Uint8Array,
  expected: ListedVersion,
): Promise<Parsed<Version>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const section = (offset: number): Uint8Array | null => {
    if (offset + 4 > bytes.length) {
      return null;
    }
    const length = view.getUint32(offset);
    return offset + 4 + length > bytes.length
      ? null
      : bytes.subarray(offset + 4, offset + 4 + length);
  };
  const json = (part: Uint8Array): unknown => {
    try {
      return JSON.parse(fromUtf8(part)) as unknown;
    } catch {
      return undefined;
    }
  };

  const manifestBytes = section(0);
  if (manifestBytes === null) {
    return refuse('the manifest is cut short');
  }
  const manifest = parseManifest(json(manifestBytes));
  if (!manifest.ok) {
    return refuse(`manifest: ${manifest.reason}`);
  }
  const { parent } = manifest.value;
  const sameParent =
    parent === null ? expected.parent === null : sameVersion(parent, expected.parent);
  if (!sameVersion(manifest.value, expected) || !sameParent) {
    return refuse('the manifest names another version than its file');
  }

  const journalOffset = 4 + manifestBytes.length;
  const journalBytes = section(journalOffset);
  if (journalBytes === null) {
    return refuse('the journal is cut short');
  }
  if ((await sha256Hex(journalBytes)) !== manifest.value.journalSha256) {
    return refuse('the journal does not match its digest');
  }
  const journal = parseJournal(json(journalBytes));
  if (!journal.ok) {
    return refuse(`journal: ${journal.reason}`);
  }

  return ok({
    manifest: manifest.value,
    journal: journal.value,
    database: bytes.subarray(journalOffset + 4 + journalBytes.length),
  });
}
