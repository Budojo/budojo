import { randomBytes as nodeRandomBytes } from 'node:crypto';

import { parseSecrets, type Secrets } from './bootstrap.js';

/**
 * The academy's keys, kept with the owner's Google account (#2033, PRD § 5.4,
 * `docs/sync/protocol.md` § The keys): a JSON file in the account's hidden
 * application data, which another device reads after «Accedi con Google».
 * **The Google account is the key**, the owner's decision: nothing seals it.
 *
 * - `APP_KEY` and `DOCUMENT_ENCRYPTION_KEY`: this PC's, the pair a recovery
 *   code carries (#1254). With them a phone opens the medical certificates
 *   its restored backup holds.
 * - `syncKey`: the key every sync file is sealed under (§ The envelope).
 * - `folder`: the sync folder's id, so a device can tell another account's
 *   folder from its own (§ The keys).
 *
 * The reader is the client's (`client/src/app/core/sync/keys.ts`); this
 * is the PC's writer. The two hold the same shape, as the protocol states it.
 */

export const KEYS_FILE = 'budojo-keys.json';

/** 32 bytes of standard, padded base64, and nothing else: `Buffer.from` would skip a stray character. */
const KEY_32 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * A UTC time as `toISOString` and Laravel write it, up to microseconds, and a
 * day that exists: the client's reader (`core/sync/parse.ts`) checks the same.
 */
function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?Z$/.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
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

export interface AcademyKeys extends Secrets {
  v: 1;
  folder: string;
  syncKey: string;
  createdAt: string;
}

export function newAcademyKeys(
  secrets: Secrets,
  now: Date,
  randomBytes: (n: number) => Buffer = nodeRandomBytes,
): AcademyKeys {
  return {
    v: 1,
    folder: randomBytes(16).toString('hex'),
    syncKey: randomBytes(32).toString('base64'),
    APP_KEY: secrets.APP_KEY,
    DOCUMENT_ENCRYPTION_KEY: secrets.DOCUMENT_ENCRYPTION_KEY,
    createdAt: now.toISOString(),
  };
}

/** Strict, as the keychain's own store is: a foreign or damaged file is refused, never half read. */
export function parseAcademyKeys(text: string): AcademyKeys {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('the keys file is not JSON');
  }
  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (record['v'] !== 1) {
    throw new Error('the keys file has an unknown version');
  }
  const folder = record['folder'];
  const syncKey = record['syncKey'];
  const createdAt = record['createdAt'];
  if (typeof folder !== 'string' || !/^[0-9a-f]{32}$/.test(folder)) {
    throw new Error('the keys file has no folder id');
  }
  if (typeof syncKey !== 'string' || !KEY_32.test(syncKey)) {
    throw new Error('the keys file has no sync key');
  }
  if (!isUtcTimestamp(createdAt)) {
    throw new Error('the keys file says not when it was made');
  }
  const secrets = parseSecrets(
    JSON.stringify({ v: 1, APP_KEY: record['APP_KEY'], DOCUMENT_ENCRYPTION_KEY: record['DOCUMENT_ENCRYPTION_KEY'] }),
  );

  return { v: 1, folder, syncKey, createdAt, ...secrets };
}

/** Whether the keys on Drive open what this PC encrypted. */
export function holdsTheseSecrets(keys: AcademyKeys, secrets: Secrets): boolean {
  return keys.APP_KEY === secrets.APP_KEY && keys.DOCUMENT_ENCRYPTION_KEY === secrets.DOCUMENT_ENCRYPTION_KEY;
}
