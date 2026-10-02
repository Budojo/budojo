import { isRecord, isUtcTimestamp, ok, Parsed, refuse } from './parse';

/**
 * The academy's keys, kept with the owner's Google account (#2033, PRD § 5.4,
 * `docs/sync/protocol.md` § The keys): `budojo-keys.json` in the account's
 * hidden application data. **The Google account is the key** (the owner's
 * decision of 2 Oct 2026): nothing seals the file, and no pairing code is kept.
 *
 * - `APP_KEY` and `DOCUMENT_ENCRYPTION_KEY`: the pair a recovery code carries
 *   (#1254), in the desktop keychain's shape (`desktop/src/bootstrap.ts`,
 *   `parseSecrets`), checked the same way wherever they come from. With them
 *   a device opens what another encrypted: the medical certificates first.
 * - `syncKey`: 32 bytes, base64, the key every sync file is sealed under.
 * - `folder`: random, made with the file. A device keeps the one it joined and
 *   checks the sync folder it reaches says the same.
 *
 * The PC writes it (`desktop/src/sync-keys.ts`); this is the reader both
 * devices' app uses.
 */
export interface AcademyKeys {
  folder: string;
  syncKey: string;
  APP_KEY: string;
  DOCUMENT_ENCRYPTION_KEY: string;
  createdAt: string;
}

/** Its name in the account's hidden application data. */
export const KEYS_FILE = 'budojo-keys.json';

const VERSION = 1;
const FOLDER = /^[0-9a-f]{32}$/;
/** 32 bytes of standard, padded base64, and nothing else: `atob` would take spaces too. */
const KEY_32 = /^[A-Za-z0-9+/]{43}=$/;

export function parseAcademyKeys(value: unknown): Parsed<AcademyKeys> {
  if (!isRecord(value)) {
    return refuse('the keys are not an object');
  }
  if (value['v'] !== VERSION) {
    return refuse(`keys version ${String(value['v'])} is not supported`);
  }
  const folder = value['folder'];
  if (typeof folder !== 'string' || !FOLDER.test(folder)) {
    return refuse('the folder id is not 32 hex characters');
  }
  const syncKey = value['syncKey'];
  if (typeof syncKey !== 'string' || !KEY_32.test(syncKey)) {
    return refuse('the sync key is not 32 bytes of base64');
  }
  const appKey = value['APP_KEY'];
  const documentKey = value['DOCUMENT_ENCRYPTION_KEY'];
  // The desktop's own checks: refusing here what the keychain would refuse
  // later keeps a device from adopting half a key set.
  if (typeof appKey !== 'string' || !appKey.startsWith('base64:') || appKey.length < 40) {
    return refuse('APP_KEY is not a Laravel key');
  }
  if (typeof documentKey !== 'string' || documentKey.length < 40) {
    return refuse('DOCUMENT_ENCRYPTION_KEY is too short');
  }
  const createdAt = value['createdAt'];
  if (!isUtcTimestamp(createdAt)) {
    return refuse('the keys say not when they were made');
  }
  return ok({ folder, syncKey, APP_KEY: appKey, DOCUMENT_ENCRYPTION_KEY: documentKey, createdAt });
}
