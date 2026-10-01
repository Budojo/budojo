import { buffer, concat, fromUtf8, gunzip, gzip, utf8 } from './bytes';

/**
 * The envelope every file on Drive travels in (PRD § 5.3, #2029):
 *
 * ```
 * "BJS2" | IV (12 bytes) | AES-256-GCM( gzip(plaintext) ), tag appended
 * ```
 *
 * - **gzip first:** ciphertext does not compress, and a database does.
 * - **A random IV per file:** a key is reused across thousands of files, and GCM
 *   with a repeated IV gives away the XOR of two plaintexts.
 * - **The file's path is the associated data.** A file renamed or moved on Drive,
 *   say an old version put in place of a new one, fails to decrypt rather than
 *   opening as the wrong thing.
 */

export const MAGIC = utf8('BJS2');
export const IV_BYTES = 12;
export const KEY_BYTES = 32;
const TAG_BYTES = 16;

export type EnvelopeFailure = 'not-an-envelope' | 'wrong-key-or-path' | 'corrupt';

/** Why a file did not open, in a form the sync state can name. */
export class EnvelopeError extends Error {
  constructor(readonly reason: EnvelopeFailure) {
    super(`envelope: ${reason}`);
  }
}

/** The academy's sync key, from its 32 raw bytes. Not extractable once imported. */
export function importSyncKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) {
    throw new Error(`a sync key is ${KEY_BYTES} bytes, not ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function newSyncKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

/** Compresses, then encrypts under `key` with `path` bound in. `iv` is for the known-answer tests only. */
export async function seal(
  key: CryptoKey,
  path: string,
  plaintext: Uint8Array,
  iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_BYTES)),
): Promise<Uint8Array> {
  return encryptLayer(key, path, await gzip(plaintext), iv);
}

/** The AES-GCM layer alone, over bytes already compressed. gzip's output varies by implementation; this does not. */
export async function encryptLayer(
  key: CryptoKey,
  path: string,
  compressed: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  if (iv.length !== IV_BYTES) {
    throw new Error(`an IV is ${IV_BYTES} bytes`);
  }
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(utf8(path)) },
    key,
    buffer(compressed),
  );
  return concat(MAGIC, iv, new Uint8Array(ciphertext));
}

/** Decrypts and decompresses a file read from `path`. Throws `EnvelopeError`. */
export async function open(key: CryptoKey, path: string, sealed: Uint8Array): Promise<Uint8Array> {
  const header = MAGIC.length + IV_BYTES;
  if (sealed.length < header + TAG_BYTES || !MAGIC.every((byte, i) => sealed[i] === byte)) {
    throw new EnvelopeError('not-an-envelope');
  }

  let compressed: ArrayBuffer;
  try {
    compressed = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(sealed.subarray(MAGIC.length, header)),
        additionalData: buffer(utf8(path)),
      },
      key,
      buffer(sealed.subarray(header)),
    );
  } catch {
    // GCM cannot tell a wrong key from a wrong path from a flipped bit: the tag
    // fails the same way for all three, by design.
    throw new EnvelopeError('wrong-key-or-path');
  }

  try {
    return await gunzip(new Uint8Array(compressed));
  } catch {
    throw new EnvelopeError('corrupt');
  }
}

/** For the small JSON files (manifests, `keys.bjs`): `open`, then UTF-8 and JSON. */
export async function openJson(key: CryptoKey, path: string, sealed: Uint8Array): Promise<unknown> {
  const bytes = await open(key, path, sealed);
  try {
    return JSON.parse(fromUtf8(bytes)) as unknown;
  } catch {
    throw new EnvelopeError('corrupt');
  }
}
