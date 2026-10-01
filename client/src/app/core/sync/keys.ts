import { isRecord, ok, Parsed, refuse } from './parse';

/**
 * `keys.bjs` (PRD § 5.4): the academy's app keys, sealed under the sync key so
 * that the pairing code can carry the sync key alone. The shape is the desktop's
 * keychain record, which the recovery code (#1254) also carries
 * (`desktop/src/bootstrap.ts`, `parseSecrets`), so a key set is checked the same
 * way wherever it comes from.
 */
export interface AppKeys {
  APP_KEY: string;
  DOCUMENT_ENCRYPTION_KEY: string;
}

const VERSION = 1;

export function serializeAppKeys(keys: AppKeys): Record<string, unknown> {
  return {
    v: VERSION,
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
  const appKey = value['APP_KEY'];
  const documentKey = value['DOCUMENT_ENCRYPTION_KEY'];
  // The desktop's own checks, word for word in effect: refusing here what the
  // keychain would refuse later keeps a bad pairing from half-succeeding.
  if (typeof appKey !== 'string' || !appKey.startsWith('base64:') || appKey.length < 40) {
    return refuse('APP_KEY is not a Laravel key');
  }
  if (typeof documentKey !== 'string' || documentKey.length < 40) {
    return refuse('DOCUMENT_ENCRYPTION_KEY is too short');
  }
  return ok({ APP_KEY: appKey, DOCUMENT_ENCRYPTION_KEY: documentKey });
}
