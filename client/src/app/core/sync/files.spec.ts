import { fromUtf8, sha256Hex, utf8 } from './bytes';
import { importSyncKey, newSyncKey, open, seal } from './envelope';
import { pullFiles, pushFiles, ServerFile, SyncFilesApi } from './files';
import { filePath } from './layout';
import { MemoryRemote } from './remote';

/**
 * The files side of the sync (#2030 part 2): documents and photos travel one
 * file each, sealed, named by their content. A device sends the contents it
 * holds and the folder lacks, and fetches the ones it lacks.
 */

/** A device's server, as `GET`/`PUT /api/v1/sync/files` see it. */
class FakeServer implements SyncFilesApi {
  readonly held = new Map<string, Uint8Array>();
  readonly written: string[] = [];
  /** Contents held at one of their paths but not at every one. */
  readonly incomplete = new Set<string>();

  constructor(readonly named: string[]) {}

  async list(): Promise<ServerFile[]> {
    return this.named.map((sha256) => ({
      sha256,
      size: this.held.get(sha256)?.length ?? null,
      present: this.held.has(sha256),
      complete: this.held.has(sha256) && !this.incomplete.has(sha256),
    }));
  }

  async read(sha256: string): Promise<Uint8Array> {
    const bytes = this.held.get(sha256);
    if (bytes === undefined) throw new Error(`not held: ${sha256}`);
    return bytes;
  }

  async write(sha256: string, bytes: Uint8Array): Promise<void> {
    if ((await sha256Hex(bytes)) !== sha256) throw new Error('mismatch');
    this.written.push(sha256);
    this.held.set(sha256, bytes);
    this.incomplete.delete(sha256);
  }
}

async function content(text: string): Promise<{ sha: string; bytes: Uint8Array }> {
  const bytes = utf8(text);
  return { sha: await sha256Hex(bytes), bytes };
}

describe('files by content (#2030)', () => {
  let key: CryptoKey;
  let remote: MemoryRemote;

  beforeEach(async () => {
    key = await importSyncKey(newSyncKey());
    remote = new MemoryRemote();
  });

  it('sends what this device holds and the folder lacks, sealed under its own name', async () => {
    const photo = await content('a photo');
    const server = new FakeServer([photo.sha]);
    server.held.set(photo.sha, photo.bytes);

    expect(await pushFiles(server, remote, key)).toBe(1);

    const sealed = await remote.read(filePath(photo.sha));
    expect(sealed).not.toBeNull();
    expect(fromUtf8(await open(key, filePath(photo.sha), sealed!))).toBe('a photo');
  });

  it('sends nothing twice: a content already in the folder stays as it is', async () => {
    const photo = await content('a photo');
    const server = new FakeServer([photo.sha]);
    server.held.set(photo.sha, photo.bytes);
    await pushFiles(server, remote, key);
    const first = await remote.read(filePath(photo.sha));

    expect(await pushFiles(server, remote, key)).toBe(0);
    expect(await remote.read(filePath(photo.sha))).toEqual(first);
  });

  it('cannot send what this device does not hold', async () => {
    const elsewhere = await content('on the other device');
    const server = new FakeServer([elsewhere.sha]);

    expect(await pushFiles(server, remote, key)).toBe(0);
    expect(remote.files.size).toBe(0);
  });

  it('fetches what this device lacks, from the other device’s push', async () => {
    const document = await content('a certificate');
    const pc = new FakeServer([document.sha]);
    pc.held.set(document.sha, document.bytes);
    await pushFiles(pc, remote, key);
    const phone = new FakeServer([document.sha]);

    const pulled = await pullFiles(phone, remote, key);

    expect(pulled).toEqual({ fetched: 1, missing: [] });
    expect(fromUtf8(phone.held.get(document.sha)!)).toBe('a certificate');
  });

  it('leaves for the next sync what the folder does not have yet', async () => {
    const later = await content('pushed in a moment');
    const phone = new FakeServer([later.sha]);

    expect(await pullFiles(phone, remote, key)).toEqual({ fetched: 0, missing: [later.sha] });
    expect(phone.written).toEqual([]);
  });

  it('never hands the server bytes that are not the content named', async () => {
    const real = await content('the real photo');
    const forged = await content('something else');
    // A file in the folder under the right name, holding other bytes: sealed
    // with the key, so it opens, but its content is not its name.
    await remote.write(filePath(real.sha), await seal(key, filePath(real.sha), forged.bytes));
    const phone = new FakeServer([real.sha]);

    expect(await pullFiles(phone, remote, key)).toEqual({ fetched: 0, missing: [real.sha] });
    expect(phone.written).toEqual([]);
  });

  it('completes a content held for one row but not yet for another, from this device', async () => {
    // The same PDF for two athletes: the phone holds one copy, the PC's
    // version names a second. Nothing to fetch; the server copies it over.
    const pdf = await content('the same pdf');
    const phone = new FakeServer([pdf.sha]);
    phone.held.set(pdf.sha, pdf.bytes);
    phone.incomplete.add(pdf.sha);

    expect(await pullFiles(phone, remote, key)).toEqual({ fetched: 1, missing: [] });
    expect(phone.written).toEqual([pdf.sha]);
    expect(remote.files.size).toBe(0);
  });

  it('does not fetch what this device already holds', async () => {
    const photo = await content('a photo');
    const server = new FakeServer([photo.sha]);
    server.held.set(photo.sha, photo.bytes);

    expect(await pullFiles(server, remote, key)).toEqual({ fetched: 0, missing: [] });
  });
});
