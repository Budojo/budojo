import { toHex, utf8 } from './bytes';
import { DriveRemote } from './drive-remote';
import { MemoryRemote, RemoteError, SyncRemote } from './remote';

interface FakeFile {
  id: string;
  name: string;
  parent: string | null;
  folder: boolean;
  bytes: Uint8Array;
  createdTime: number;
}

/**
 * Just enough of Drive v3 for `DriveRemote`: the `files` queries it writes,
 * folder creation, resumable uploads, media reads and deletes. Every call is
 * recorded, with its token.
 */
class FakeDrive {
  readonly files: FakeFile[] = [];
  readonly calls: { method: string; url: string; token: string | null }[] = [];
  private next = 0;
  private sessions = new Map<string, { id: string | null; name?: string; parent?: string }>();
  answer401 = false;

  add(name: string, parent: string | null, folder: boolean, bytes = new Uint8Array()): FakeFile {
    const file = { id: `id${this.next++}`, name, parent, folder, bytes, createdTime: this.next };
    this.files.push(file);
    return file;
  }

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    this.calls.push({ method, url, token: headers.get('Authorization') });
    if (this.answer401) {
      return new Response('{}', { status: 401 });
    }
    const parsed = new URL(url);

    if (parsed.pathname.startsWith('/session/')) {
      const session = this.sessions.get(parsed.pathname) as {
        id: string | null;
        name?: string;
        parent?: string;
      };
      const bytes = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
      const target =
        session.id === null
          ? this.add(session.name as string, session.parent as string, false)
          : (this.files.find((file) => file.id === session.id) as FakeFile);
      target.bytes = bytes;
      return Response.json({ id: target.id });
    }
    if (parsed.pathname.startsWith('/upload/drive/v3/files')) {
      const id = parsed.pathname.split('/')[5] ?? null;
      const meta = JSON.parse(String(init.body)) as { name?: string; parents?: string[] };
      const location = `https://upload.example/session/${this.next++}`;
      this.sessions.set(new URL(location).pathname, {
        id,
        name: meta.name,
        parent: meta.parents?.[0],
      });
      return new Response(null, { status: 200, headers: { Location: location } });
    }

    const id = parsed.pathname.split('/')[4];
    if (id !== undefined) {
      const file = this.files.find((candidate) => candidate.id === id);
      if (file === undefined) {
        return new Response('{}', { status: 404 });
      }
      if (method === 'DELETE') {
        this.files.splice(this.files.indexOf(file), 1);
        return new Response(null, { status: 204 });
      }
      return new Response(new Uint8Array(file.bytes));
    }
    if (method === 'POST') {
      const meta = JSON.parse(String(init.body)) as { name: string; parents?: string[] };
      return Response.json({ id: this.add(meta.name, meta.parents?.[0] ?? null, true).id });
    }

    // files.list: the three query shapes DriveRemote writes.
    const q = parsed.searchParams.get('q') ?? '';
    const name = /name='([^']+)'/.exec(q)?.[1];
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const folderOnly = q.includes("mimeType='application/vnd.google-apps.folder'");
    const matches = this.files
      .filter((file) => name === undefined || file.name === name)
      .filter((file) => parent === undefined || file.parent === parent)
      .filter((file) => !folderOnly || file.folder)
      // Drive promises no order unless asked: newest first here, so a caller
      // that forgets `orderBy` gets the wrong folder in the tests too.
      .sort((a, b) =>
        parsed.searchParams.get('orderBy') === 'createdTime'
          ? a.createdTime - b.createdTime
          : b.createdTime - a.createdTime,
      );
    return Response.json({
      files: matches.map((file) => ({
        id: file.id,
        name: file.name,
        size: String(file.bytes.length),
      })),
    });
  };
}

/** The contract every remote keeps, run against the memory one and the Drive one alike. */
function contract(name: string, make: () => SyncRemote): void {
  describe(`${name} keeps the SyncRemote contract`, () => {
    it('writes, lists, reads back and removes', async () => {
      const remote = make();

      await remote.write('versions/000001-pc4f2a.root.bjs', utf8('v1'));
      await remote.write('keys.bjs', utf8('k'));

      expect(await remote.list('versions')).toEqual([
        { path: 'versions/000001-pc4f2a.root.bjs', size: 2 },
      ]);
      expect(toHex((await remote.read('versions/000001-pc4f2a.root.bjs')) as Uint8Array)).toBe(
        toHex(utf8('v1')),
      );

      await remote.remove('versions/000001-pc4f2a.root.bjs');
      expect(await remote.list('versions')).toEqual([]);
      expect(await remote.read('versions/000001-pc4f2a.root.bjs')).toBeNull();
    });

    it('replaces a file written twice, instead of keeping two', async () => {
      const remote = make();

      await remote.write('devices/pc4f2a.bjs', utf8('first'));
      await remote.write('devices/pc4f2a.bjs', utf8('second'));

      expect(await remote.list('devices')).toEqual([{ path: 'devices/pc4f2a.bjs', size: 6 }]);
      expect(toHex((await remote.read('devices/pc4f2a.bjs')) as Uint8Array)).toBe(
        toHex(utf8('second')),
      );
    });

    it('lists nothing, and reads null, before anything was written', async () => {
      const remote = make();

      expect(await remote.list('files')).toEqual([]);
      expect(await remote.read('keys.bjs')).toBeNull();
      await expect(remote.remove('keys.bjs')).resolves.toBeUndefined();
    });

    it('refuses to write outside the layout', async () => {
      await expect(make().write('../budojo.sqlite', utf8('x'))).rejects.toThrow(
        'not a path in the sync folder',
      );
    });
  });
}

contract('MemoryRemote', () => new MemoryRemote());
contract('DriveRemote', () => new DriveRemote(async () => 'tok', new FakeDrive().fetch));

describe('DriveRemote on Google Drive (#2029)', () => {
  it('works inside the Budojo folder the PC made, and builds sync/ under it', async () => {
    const drive = new FakeDrive();
    const budojo = drive.add('Budojo', null, true);
    const remote = new DriveRemote(async () => 'tok', drive.fetch);

    await remote.write('versions/000001-pc4f2a.root.bjs', utf8('v1'));

    const sync = drive.files.find((file) => file.name === 'sync');
    const versions = drive.files.find((file) => file.name === 'versions');
    expect(sync?.parent).toBe(budojo.id);
    expect(versions?.parent).toBe(sync?.id);
    expect(drive.files.filter((file) => file.name === 'Budojo')).toHaveLength(1);
  });

  it('reads without creating any folder', async () => {
    const drive = new FakeDrive();
    const remote = new DriveRemote(async () => 'tok', drive.fetch);

    await remote.list('versions');
    await remote.read('keys.bjs');

    expect(drive.files).toEqual([]);
  });

  it('settles on the oldest folder when two of one name exist', async () => {
    const drive = new FakeDrive();
    const older = drive.add('Budojo', null, true);
    drive.add('Budojo', null, true);
    const remote = new DriveRemote(async () => 'tok', drive.fetch);

    await remote.write('keys.bjs', utf8('k'));

    expect(drive.files.find((file) => file.name === 'sync')?.parent).toBe(older.id);
  });

  it('settles two devices that make the sync folder at the same moment on the same one', async () => {
    const drive = new FakeDrive();
    drive.add('Budojo', null, true);
    const pc = new DriveRemote(async () => 'tok', drive.fetch);
    const phone = new DriveRemote(async () => 'tok', drive.fetch);

    await Promise.all([
      pc.write('keys.bjs', utf8('k')),
      phone.write('devices/phone9c1e.bjs', utf8('d')),
    ]);
    await phone.write(`files/${'ef'.repeat(32)}.bjs`, utf8('f'));

    expect(drive.files.filter((file) => file.name === 'sync').length).toBeGreaterThan(1);
    expect(await pc.read('devices/phone9c1e.bjs')).not.toBeNull();
    expect(await pc.list('files')).toHaveLength(1);
  });

  it('calls a download cut off halfway "offline"', async () => {
    const drive = new FakeDrive();
    const remote = new DriveRemote(
      async () => 'tok',
      async (url, init) => {
        if (url.includes('alt=media')) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.reject(new TypeError('network error')),
          } as unknown as Response;
        }
        return drive.fetch(url, init);
      },
    );
    await remote.write('keys.bjs', utf8('k'));

    await expect(remote.read('keys.bjs')).rejects.toMatchObject({ reason: 'offline' });
  });

  it('sends the token on every call, and uploads through a resumable session', async () => {
    const drive = new FakeDrive();
    const remote = new DriveRemote(async () => 'tok', drive.fetch);

    await remote.write('keys.bjs', utf8('k'));

    expect(drive.calls.every((call) => call.token === 'Bearer tok')).toBe(true);
    expect(drive.calls.some((call) => call.url.includes('uploadType=resumable'))).toBe(true);
    expect(
      drive.calls.some((call) => call.method === 'PUT' && call.url.includes('/session/')),
    ).toBe(true);
  });

  it('carries binary bytes unchanged', async () => {
    const drive = new FakeDrive();
    const remote = new DriveRemote(async () => 'tok', drive.fetch);
    const bytes = Uint8Array.from({ length: 512 }, (_, i) => i % 256);

    await remote.write('files/' + 'cd'.repeat(32) + '.bjs', bytes);

    expect(toHex((await remote.read('files/' + 'cd'.repeat(32) + '.bjs')) as Uint8Array)).toBe(
      toHex(bytes),
    );
  });

  it('says "unauthorized" when Google refuses the token, so the state can ask to sign in again', async () => {
    const drive = new FakeDrive();
    drive.answer401 = true;

    await expect(new DriveRemote(async () => 'tok', drive.fetch).list('versions')).rejects.toEqual(
      new RemoteError('unauthorized', 'Google refused the token'),
    );
  });

  it('says "offline" when the network fails', async () => {
    const remote = new DriveRemote(
      async () => 'tok',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    );

    await expect(remote.list('versions')).rejects.toMatchObject({ reason: 'offline' });
  });

  it("passes the token provider's own refusal through untouched", async () => {
    const consent = Object.assign(new Error('consent'), { code: 'NEEDS_CONSENT' });
    const remote = new DriveRemote(async () => {
      throw consent;
    }, new FakeDrive().fetch);

    await expect(remote.list('versions')).rejects.toBe(consent);
  });
});
