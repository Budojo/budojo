// Known-answer vectors for the sync envelope (#2029), made by an implementation
// independent of `envelope.ts`: Node's crypto and zlib, not WebCrypto and
// CompressionStream. `envelope.spec.ts` must reproduce them byte for byte.
//
//   node client/src/app/core/sync/vectors/make-envelope-vectors.mjs
//
// The output is committed. Re-run only if the format changes on purpose.
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('BJS2', 'ascii');
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));

const cases = [
  {
    name: 'a short text',
    path: 'versions/000042-pc.bjs',
    iv: '000102030405060708090a0b',
    plaintext: Buffer.from('Budojo: 14 presenze, 2 pagamenti.', 'utf8'),
  },
  {
    name: 'empty',
    path: 'devices/pc.bjs',
    iv: 'ffeeddccbbaa998877665544',
    plaintext: Buffer.alloc(0),
  },
  {
    name: 'binary, with a long path',
    path: 'files/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.bjs',
    iv: '5a5a5a5a5a5a5a5a5a5a5a5a',
    plaintext: Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7) % 256)),
  },
];

const vectors = cases.map(({ name, path, iv, plaintext }) => {
  const compressed = gzipSync(plaintext);
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  cipher.setAAD(Buffer.from(path, 'utf8'));
  const body = Buffer.concat([cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
  const sealed = Buffer.concat([MAGIC, Buffer.from(iv, 'hex'), body]);

  // Node opens its own output before it is written down.
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from(path, 'utf8'));
  decipher.setAuthTag(body.subarray(body.length - 16));
  const back = gunzipSync(
    Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]),
  );
  if (!back.equals(plaintext)) {
    throw new Error(`${name}: Node cannot open its own vector`);
  }

  return {
    name,
    key: key.toString('hex'),
    iv,
    path,
    plaintext: plaintext.toString('hex'),
    compressed: compressed.toString('hex'),
    sealed: sealed.toString('hex'),
  };
});

writeFileSync(
  new URL('./envelope-vectors.json', import.meta.url),
  JSON.stringify(vectors, null, 2) + '\n',
);
console.log(`${vectors.length} vectors written`);
