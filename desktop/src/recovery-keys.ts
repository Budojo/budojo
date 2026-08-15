import { parseSecrets, serializeSecrets, type Secrets } from './bootstrap.js';

/**
 * Recovery codes (#1254). A single copy-pasteable string that carries the
 * two encryption keys (`APP_KEY`, `DOCUMENT_ENCRYPTION_KEY`) out of one
 * machine's OS keychain and into another's.
 *
 * Why this exists: a backup archive holds the data + the *encrypted*
 * documents but never `secrets.bin` — the keys are OS-keychain (DPAPI)
 * encrypted and bound to the Windows user that created them, so a restore
 * onto a fresh machine recovers the relational data but cannot decrypt the
 * medical certificates (see `docs/desktop/backup-restore.md`). A recovery
 * code is the portable form of the keys the owner stores in a password
 * manager, so that fresh-machine recovery is actually possible.
 *
 * The pure encode/decode lives here so it is exhaustively unit-testable; the
 * keychain read/write and the supervisor restart live in `main.ts`.
 *
 * Format: `BUDOJO-RECOVERY-1:<base64url of the serialized secrets>`. The
 * payload is the exact `{v,APP_KEY,DOCUMENT_ENCRYPTION_KEY}` JSON the keychain
 * store holds, so decoding reuses `parseSecrets` — one validation, one source
 * of truth for what a valid key set is.
 */

export const RECOVERY_PREFIX = 'BUDOJO-RECOVERY-1:';

export function encodeRecoveryCode(secrets: Secrets): string {
  return RECOVERY_PREFIX + Buffer.from(serializeSecrets(secrets), 'utf8').toString('base64url');
}

export type RecoveryDecode = { ok: true; secrets: Secrets } | { ok: false; reason: string };

/**
 * Strict, and deliberately terse on failure: a mistyped, truncated or foreign
 * string must be refused with a clear message rather than yield partial keys.
 * Reuses `parseSecrets`, so the exact same shape/length checks that gate the
 * keychain store gate an imported code.
 */
export function decodeRecoveryCode(code: string): RecoveryDecode {
  const trimmed = code.trim();

  if (!trimmed.startsWith(RECOVERY_PREFIX)) {
    return { ok: false, reason: 'This is not a Budojo recovery code.' };
  }

  const payload = trimmed.slice(RECOVERY_PREFIX.length);

  if (payload.length === 0) {
    return { ok: false, reason: 'The recovery code is empty.' };
  }

  let json: string;
  try {
    json = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'The recovery code is corrupted or incomplete.' };
  }

  try {
    return { ok: true, secrets: parseSecrets(json) };
  } catch {
    return { ok: false, reason: 'The recovery code is corrupted or incomplete.' };
  }
}
