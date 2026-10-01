import { isRecord, ok, Parsed, refuse } from './parse';

/**
 * `keys.bjs` (PRD § 5.4): the academy's app keys, sealed under the sync key so
 * that the pairing code can carry the sync key alone. The key fields have the
 * desktop's keychain shape, which the recovery code (#1254) also carries
 * (`desktop/src/bootstrap.ts`, `parseSecrets`), so a key set is checked the
 * same way wherever it comes from.
 *
 * **It also names the folder.** `folder` is random, made once by the device that
 * creates the sync folder. A device keeps the one it joined, and before it syncs
 * it checks that the folder it reaches says the same. Another account's folder
 * for the same academy, after a sign-in to the wrong Google account, then asks
 * the owner before anything is pulled or pushed.
 */
export interface AppKeys {
  folder: string;
  APP_KEY: string;
  DOCUMENT_ENCRYPTION_KEY: string;
}

const VERSION = 1;
const FOLDER = /^[0-9a-f]{32}$/;

export function newFolderId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function serializeAppKeys(keys: AppKeys): Record<string, unknown> {
  return {
    v: VERSION,
    folder: keys.folder,
    APP_KEY: keys.APP_KEY,
    DOCUMENT_ENCRYPTION_KEY: keys.DOCUMENT_ENCRYPTION_KEY,
  };
}

export function parseAppKeys(value: unknown): Parsed<AppKeys> {
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
  const appKey = value['APP_KEY'];
  const documentKey = value['DOCUMENT_ENCRYPTION_KEY'];
  // The desktop's own checks: refusing here what the keychain would refuse
  // later keeps a bad pairing from half-succeeding.
  if (typeof appKey !== 'string' || !appKey.startsWith('base64:') || appKey.length < 40) {
    return refuse('APP_KEY is not a Laravel key');
  }
  if (typeof documentKey !== 'string' || documentKey.length < 40) {
    return refuse('DOCUMENT_ENCRYPTION_KEY is too short');
  }
  return ok({ folder, APP_KEY: appKey, DOCUMENT_ENCRYPTION_KEY: documentKey });
}
