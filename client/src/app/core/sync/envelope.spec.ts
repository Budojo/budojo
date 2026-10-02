import { fromHex, toHex, utf8 } from './bytes';
import {
  encryptLayer,
  EnvelopeError,
  importSyncKey,
  newSyncKey,
  open,
  openJson,
  seal,
} from './envelope';
import vectors from './vectors/envelope-vectors.json';

/**
 * The envelope (#2029). The vectors come from Node's crypto and zlib
 * (`vectors/make-envelope-vectors.mjs`), an implementation independent of the
 * WebCrypto and CompressionStream this file runs on, which is the same pair
 * Electron's renderer and Android's WebView have.
 */
describe('the sync envelope', () => {
  describe('known-answer vectors from Node', () => {
    for (const vector of vectors) {
      it(`encrypts "${vector.name}" exactly as Node does`, async () => {
        const key = await importSyncKey(fromHex(vector.key));

        const sealed = await encryptLayer(
          key,
          vector.path,
          fromHex(vector.compressed),
          fromHex(vector.iv),
        );

        expect(toHex(sealed)).toBe(vector.sealed);
      });

      it(`opens Node's "${vector.name}"`, async () => {
        const key = await importSyncKey(fromHex(vector.key));

        const plaintext = await open(key, vector.path, fromHex(vector.sealed));

        expect(toHex(plaintext)).toBe(vector.plaintext);
      });
    }
  });

  it('round-trips through its own gzip', async () => {
    const key = await importSyncKey(newSyncKey());
    const data = utf8('x'.repeat(10_000));

    const sealed = await seal(key, 'versions/000001-pc.bjs', data);

    expect(sealed.length).toBeLessThan(data.length / 10);
    expect(toHex(await open(key, 'versions/000001-pc.bjs', sealed))).toBe(toHex(data));
  });

  it('uses a new IV every time, so the same file never encrypts the same twice', async () => {
    const key = await importSyncKey(newSyncKey());

    const a = await seal(key, 'devices/pc.bjs', utf8('same'));
    const b = await seal(key, 'devices/pc.bjs', utf8('same'));

    expect(toHex(a.subarray(4, 16))).not.toBe(toHex(b.subarray(4, 16)));
  });

  it('refuses a file moved to another path', async () => {
    const vector = vectors[0];
    const key = await importSyncKey(fromHex(vector.key));

    await expect(open(key, 'versions/000043-pc.bjs', fromHex(vector.sealed))).rejects.toEqual(
      new EnvelopeError('wrong-key-or-path'),
    );
  });

  it('refuses another academy’s key', async () => {
    const vector = vectors[0];

    await expect(
      open(await importSyncKey(newSyncKey()), vector.path, fromHex(vector.sealed)),
    ).rejects.toMatchObject({ reason: 'wrong-key-or-path' });
  });

  it('refuses a single flipped bit', async () => {
    const vector = vectors[2];
    const sealed = fromHex(vector.sealed);
    sealed[40] ^= 1;

    await expect(
      open(await importSyncKey(fromHex(vector.key)), vector.path, sealed),
    ).rejects.toMatchObject({ reason: 'wrong-key-or-path' });
  });

  it('refuses something that is not an envelope at all', async () => {
    const key = await importSyncKey(newSyncKey());

    await expect(open(key, 'folder.bjs', utf8('PK\u0003\u0004 a zip'))).rejects.toMatchObject({
      reason: 'not-an-envelope',
    });
    await expect(open(key, 'folder.bjs', new Uint8Array())).rejects.toMatchObject({
      reason: 'not-an-envelope',
    });
  });

  it('calls a well-sealed file that is not JSON corrupt', async () => {
    const key = await importSyncKey(newSyncKey());

    await expect(
      openJson(key, 'folder.bjs', await seal(key, 'folder.bjs', utf8('{not json'))),
    ).rejects.toMatchObject({ reason: 'corrupt' });
  });

  it('takes only a 32-byte key', () => {
    expect(() => importSyncKey(new Uint8Array(16))).toThrow('32 bytes');
  });
});
