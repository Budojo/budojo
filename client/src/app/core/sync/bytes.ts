/**
 * Byte helpers for the sync protocol (#2029). The protocol runs in Electron's
 * renderer and in Android's WebView (PRD § 5.6), so everything here is plain
 * web platform: no Node `Buffer`, no Angular.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Throws on bytes that are not valid UTF-8, rather than inventing replacement characters. */
export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) {
    throw new Error('not lowercase hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The bytes as a fresh `ArrayBuffer`-backed view. WebCrypto and the stream
 * constructors are typed to refuse a view over a `SharedArrayBuffer`, and a
 * slice is the portable way to hand them exactly these bytes.
 */
export function buffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/**
 * Raw bytes as a request body. A `File`, because on the phone Capacitor's
 * native HTTP sends a File's bytes as they are, and turns any other binary
 * body into something else: a `Uint8Array` goes through a `TextDecoder`, an
 * `ArrayBuffer` through JSON (`native-bridge.js`, `convertBody`). Reads are
 * safe: Capacitor proxies a GET through the WebView itself.
 */
export function binaryBody(bytes: Uint8Array): File {
  return new File([buffer(bytes)], 'body', { type: 'application/octet-stream' });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(bytes))));
}

async function pipe(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  // Through `Response`, not `Blob.stream()`: the WebView and Electron have both,
  // and the jsdom the tests run in has only the first.
  const stream = (new Response(buffer(bytes)).body as ReadableStream<Uint8Array>).pipeThrough(
    transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('gzip'));
}

export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream('gzip'));
}
