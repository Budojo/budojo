import { buffer, concat } from './bytes';
import { KEY_BYTES } from './envelope';
import { ok, Parsed, refuse } from './parse';
import { PROTOCOL } from './version';

/**
 * The pairing code (PRD § 5.4, #2029): the sync key and the protocol version,
 * shown as a QR and as 56 characters in groups of four, for a PC with no camera.
 *
 * ```
 * protocol (1 byte) | sync key (32 bytes) | check (2 bytes of SHA-256 over the rest)
 * ```
 *
 * Crockford's base32 spells it: no I, L, O or U, and a 0 read as O or a 1 read
 * as I or L is taken back, because a person types it. The check catches a typo,
 * and the key is never derived from it, so a mistyped code is refused, not
 * turned into a wrong key.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAYLOAD_BYTES = 1 + KEY_BYTES + 2;
export const CODE_CHARACTERS = Math.ceil((PAYLOAD_BYTES * 8) / 5);
/** What a QR carries: the code with a prefix, so a scan of something else is refused at once. */
export const QR_PREFIX = 'BUDOJO-PAIR:';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function fromBase32(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) {
      return null;
    }
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function check(body: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(body))).subarray(0, 2);
}

/** The code as a person reads it: groups of four, `7K2M-…`. */
export async function encodePairingCode(syncKey: Uint8Array): Promise<string> {
  if (syncKey.length !== KEY_BYTES) {
    throw new Error(`a sync key is ${KEY_BYTES} bytes`);
  }
  const body = concat(new Uint8Array([PROTOCOL]), syncKey);
  return (base32(concat(body, await check(body))).match(/.{1,4}/g) as string[]).join('-');
}

export async function encodePairingQr(syncKey: Uint8Array): Promise<string> {
  return QR_PREFIX + (await encodePairingCode(syncKey)).replace(/-/g, '');
}

/**
 * Reads a typed or scanned code back to the sync key. Forgiving about how it was
 * typed (case, spaces, dashes, O for 0, I or L for 1), strict about what it says.
 */
export async function decodePairingCode(input: string): Promise<Parsed<Uint8Array>> {
  let text = input.trim().toUpperCase();
  if (text.startsWith(QR_PREFIX)) {
    text = text.slice(QR_PREFIX.length);
  }
  text = text.replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

  if (text.length !== CODE_CHARACTERS) {
    return refuse(`a pairing code has ${CODE_CHARACTERS} characters, this one has ${text.length}`);
  }
  const bytes = fromBase32(text);
  if (bytes === null) {
    return refuse('the code has a character that is not in it');
  }
  const payload = bytes.subarray(0, PAYLOAD_BYTES);
  const body = payload.subarray(0, PAYLOAD_BYTES - 2);
  const expected = await check(body);
  if (payload[PAYLOAD_BYTES - 2] !== expected[0] || payload[PAYLOAD_BYTES - 1] !== expected[1]) {
    return refuse('the code does not check out: a character is mistyped');
  }
  if (body[0] !== PROTOCOL) {
    return refuse(
      `the code is for protocol ${body[0]}, this app speaks ${PROTOCOL}: update the app`,
    );
  }
  return ok(new Uint8Array(body.subarray(1)));
}
