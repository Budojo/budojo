import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncOnce } from './engine';
import { importSyncKey, newSyncKey, seal } from './envelope';
import { sealFolder } from './folder';
import { HttpSyncServer } from './http-sync-server';
import { utf8 } from './bytes';
import { devicePath, FOLDER_PATH } from './layout';
import { loadLedger } from './ledger-store';
import { MemoryRemote, RemoteError, SyncRemote } from './remote';
import {
  PAGE_RELOAD,
  PUSH_DELAY_MS,
  SYNC_PLATFORM,
  SyncIdentity,
  SyncPlatform,
  SyncService,
} from './sync.service';
import { MemoryDevice } from './testing/memory-device';
import { WriteGate } from './write-gate';

/**
 * When the sync runs and what it says (#2046): the phone's service, against a
 * folder in memory and its own server in memory. The PC is another
 * `MemoryDevice` that runs the engine by hand.
 */
describe('SyncService', () => {
  const FOLDER = '0123456789abcdef0123456789abcdef';
  let raw: Uint8Array;
  let key: CryptoKey;
  let remote: MemoryRemote;
  let phone: MemoryDevice;
  let reload: ReturnType<typeof vi.fn>;

  function identity(): SyncIdentity {
    return { device: phone.id, folder: FOLDER, syncKey: btoa(String.fromCharCode(...raw)) };
  }

  function setUp(platform: Partial<SyncPlatform> = {}): SyncService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SYNC_PLATFORM,
          useValue: {
            identity: async () => identity(),
            remote,
            shell: { swapIn: async () => phone.swapIn() },
            publishesFirst: false,
            reconnect: async () => undefined,
            ...platform,
          } satisfies SyncPlatform,
        },
        { provide: HttpSyncServer, useValue: phone },
        { provide: PAGE_RELOAD, useValue: reload },
      ],
    });
    return TestBed.inject(SyncService);
  }

  /** The PC publishes its academy as version 1, as its own service will. */
  async function pcPublishes(): Promise<MemoryDevice> {
    const pc = new MemoryDevice('pc4f2a', 'Eagles BJJ');
    await remote.write(FOLDER_PATH, await sealFolder(key, FOLDER));
    let ledger = pc.ledger;
    await syncOnce({
      device: pc.id,
      app: '2.77.0',
      key,
      remote,
      server: pc,
      shell: { swapIn: async () => pc.swapIn() },
      ledger,
      saveLedger: (next) => (ledger = next),
      holdWrites: (work) => work(),
      now: () => Date.now(),
    });
    return pc;
  }

  beforeEach(async () => {
    localStorage.clear();
    raw = newSyncKey();
    key = await importSyncKey(raw);
    remote = new MemoryRemote(() => Date.now());
    phone = new MemoryDevice('phone9c1e', null);
    reload = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it('stays off until the phone joined the academy’s sync', async () => {
    const sync = setUp({ identity: async () => null });

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'off' });
    expect(remote.files.size).toBe(0);
  });

  it('pulls the PC’s academy into a phone that has none, and loads the page again', async () => {
    await pcPublishes();
    const sync = setUp();

    await sync.syncNow();

    expect(phone.db.academy).toBe('Eagles BJJ');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(loadLedger({ device: phone.id, folder: FOLDER }).base).toEqual({
      seq: 1,
      device: 'pc4f2a',
    });
  });

  it('pushes what the owner marked on the phone, and says it is aligned', async () => {
    await pcPublishes();
    const sync = setUp();
    await sync.syncNow();

    phone.write('Luca on 2 Oct');
    await sync.syncNow();

    expect(sync.state().kind).toBe('synced');
    expect([...remote.files.keys()]).toContain('versions/000002-phone9c1e.000001-pc4f2a.bjs');
  });

  it('waits for the PC when the folder holds no academy yet, and publishes nothing of its own', async () => {
    phone = new MemoryDevice('phone9c1e', 'Eagles BJJ');
    const sync = setUp();

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'waiting-first' });
    expect([...remote.files.keys()]).toEqual([FOLDER_PATH]);
  });

  it('asks the owner when the phone holds an academy of its own and the PC published one', async () => {
    await pcPublishes();
    phone = new MemoryDevice('phone9c1e', 'Eagles BJJ, restored from a backup');
    const sync = setUp();

    await sync.syncNow();

    expect(sync.state()).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'pc4f2a' },
      mine: false,
    });
    expect(phone.db.academy).toBe('Eagles BJJ, restored from a backup');
    expect(reload).not.toHaveBeenCalled();
  });

  it('takes the PC’s gym when the owner chooses it, and loads the page again', async () => {
    await pcPublishes();
    phone = new MemoryDevice('phone9c1e', 'Eagles BJJ, restored from a backup');
    const sync = setUp();
    await sync.syncNow();
    expect(sync.state().kind).toBe('ask');

    await sync.resolve('folder', { seq: 1, device: 'pc4f2a' });

    expect(phone.db.academy).toBe('Eagles BJJ');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses to be a third device: two already sync with the folder', async () => {
    await pcPublishes();
    await remote.write(
      devicePath('phone7k2m'),
      await seal(key, devicePath('phone7k2m'), utf8('{}')),
    );
    const sync = setUp();

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'full' });
    expect(remote.files.has(devicePath(phone.id))).toBe(false);
  });

  it('loads the page again after a swap even when the round then fails', async () => {
    await pcPublishes();
    const afterTheSwap: SyncRemote = {
      list: (folder) => remote.list(folder),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        // The report after the pull: the gym's connection drops.
        if (path.startsWith('devices/') && phone.db.academy !== null) {
          throw new RemoteError('offline', 'the connection dropped after the swap');
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };
    const sync = setUp({ remote: afterTheSwap });

    await sync.syncNow();

    expect(phone.db.academy).toBe('Eagles BJJ');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing with a choice when nothing was asked', async () => {
    await pcPublishes();
    const sync = setUp();
    await sync.resolve('device', { seq: 1, device: 'pc4f2a' });

    // No version of any kind: a root as much as one on top.
    expect([...remote.files.keys()].filter((path) => path.startsWith('versions/'))).toEqual([
      'versions/000001-pc4f2a.root.bjs',
    ]);
  });

  it('stops when the owner signs out: no round is started after', async () => {
    vi.useFakeTimers();
    let rounds = 0;
    const sync = setUp({
      identity: async () => {
        rounds++;
        return null;
      },
    });
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(rounds).toBe(1);

    sync.stop();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(rounds).toBe(1);
    expect(sync.state()).toEqual({ kind: 'off' });
  });

  it('starts nothing after sign-out even when a round still running then fails', async () => {
    vi.useFakeTimers();
    let rounds = 0;
    let fail: (error: Error) => void = () => undefined;
    const blocked: SyncRemote = {
      list: () => new Promise((_, reject) => (fail = reject)),
      read: () => new Promise((_, reject) => (fail = reject)),
      write: async () => undefined,
      remove: async () => undefined,
    };
    const sync = setUp({
      remote: blocked,
      identity: async () => {
        rounds++;
        return identity();
      },
    });
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(rounds).toBe(1);

    // The owner signs out while the round waits for Drive; then the round fails.
    sync.stop();
    fail(new RemoteError('offline', 'no network'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(rounds).toBe(1);
  });

  it('runs a round of its own after a choice the folder no longer needs: it emptied before the confirm', async () => {
    await pcPublishes();
    phone = new MemoryDevice('phone9c1e', 'Eagles BJJ, restored from a backup');
    const sync = setUp();
    await sync.syncNow();
    expect(sync.state().kind).toBe('ask');
    for (const path of [...remote.files.keys()].filter((p) => p.startsWith('versions/'))) {
      remote.files.delete(path);
    }

    await sync.resolve('folder', { seq: 1, device: 'pc4f2a' });
    await vi.waitFor(() => expect(sync.state()).toEqual({ kind: 'waiting-first' }));
    expect(phone.db.academy).toBe('Eagles BJJ, restored from a backup');
  });

  it('keeps the question on screen while a round looks again in the background', async () => {
    await pcPublishes();
    phone = new MemoryDevice('phone9c1e', 'Eagles BJJ, restored from a backup');
    let block = false;
    let release: () => void = () => undefined;
    const slow: SyncRemote = {
      list: async (folder) => {
        if (block) {
          await new Promise<void>((resolve) => (release = resolve));
        }
        return remote.list(folder);
      },
      read: (path) => remote.read(path),
      write: (path, bytes) => remote.write(path, bytes),
      remove: (path) => remote.remove(path),
    };
    const sync = setUp({ remote: slow });
    await sync.syncNow();
    expect(sync.state().kind).toBe('ask');

    block = true;
    const looking = sync.syncNow();
    await new Promise((resolve) => setTimeout(resolve));
    expect(sync.state().kind).toBe('ask');

    block = false;
    release();
    await looking;
    expect(sync.state().kind).toBe('ask');
  });

  it('writes nothing to another academy’s folder', async () => {
    await remote.write(FOLDER_PATH, await sealFolder(key, 'f'.repeat(32)));
    const sync = setUp();

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'another-folder' });
    expect([...remote.files.keys()]).toEqual([FOLDER_PATH]);
  });

  it('asks for Google again when it let go of the phone', async () => {
    const refusing: SyncRemote = {
      list: async () => {
        throw new RemoteError('unauthorized', 'token expired');
      },
      read: async () => {
        throw new RemoteError('unauthorized', 'token expired');
      },
      write: async () => undefined,
      remove: async () => undefined,
    };
    const sync = setUp({ remote: refusing });

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'reconnect' });
  });

  it('counts what waits to be sent while there is no network', async () => {
    await pcPublishes();
    const sync = setUp();
    await sync.syncNow();
    phone.write('Luca on 2 Oct');
    phone.write('Giulia on 2 Oct');
    const offline: SyncRemote = {
      list: async () => {
        throw new RemoteError('offline', 'no network');
      },
      read: async () => {
        throw new RemoteError('offline', 'no network');
      },
      write: async () => undefined,
      remove: async () => undefined,
    };
    TestBed.resetTestingModule();
    const offlineSync = setUp({ remote: offline });

    await offlineSync.syncNow();

    expect(offlineSync.state()).toEqual({ kind: 'pending', count: 2, offline: true });
  });

  it('still counts as to send what a failed upload carried: Drive may not have it', async () => {
    await pcPublishes();
    const sync = setUp();
    await sync.syncNow();
    phone.write('Luca on 2 Oct');
    phone.write('Giulia on 2 Oct');
    const failingUploads: SyncRemote = {
      list: (folder) => remote.list(folder),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          throw new RemoteError('offline', 'the connection dropped mid-upload');
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };
    TestBed.resetTestingModule();
    const failing = setUp({ remote: failingUploads });

    await failing.syncNow();
    expect(failing.state()).toEqual({ kind: 'pending', count: 2, offline: true });

    // The next round waits for the push to show up, and says the same.
    await failing.syncNow();
    expect(failing.state()).toEqual({ kind: 'pending', count: 2, offline: false });
  });

  it('still counts what waits when the identity itself cannot be read for want of a network', async () => {
    await pcPublishes();
    let online = true;
    const sync = setUp({
      identity: async () => {
        if (!online) {
          throw new RemoteError('offline', 'no network to read the keys');
        }
        return identity();
      },
    });
    await sync.syncNow();
    phone.write('Luca on 2 Oct');
    online = false;

    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'pending', count: 1, offline: true });
  });

  it('syncs on opening, and a few seconds after a write, not at once', async () => {
    vi.useFakeTimers();
    let rounds = 0;
    const sync = setUp({
      identity: async () => {
        rounds++;
        return null;
      },
    });

    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(rounds).toBe(1);

    TestBed.inject(WriteGate)
      .pass(
        () => of(new HttpResponse({ status: 201 })),
        (event) => event instanceof HttpResponse,
      )
      .subscribe();
    vi.advanceTimersByTime(PUSH_DELAY_MS - 1);
    expect(rounds).toBe(1);
    vi.advanceTimersByTime(1);
    expect(rounds).toBe(2);
  });

  it('syncs when the network comes back', async () => {
    vi.useFakeTimers();
    let rounds = 0;
    const sync = setUp({
      identity: async () => {
        rounds++;
        return null;
      },
    });
    sync.start();
    await vi.advanceTimersByTimeAsync(0);

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(rounds).toBe(2);
  });

  it('does nothing on a runtime with no sync', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: HttpSyncServer, useValue: phone }] });
    const sync = TestBed.inject(SyncService);

    sync.start();
    await sync.syncNow();

    expect(sync.state()).toEqual({ kind: 'off' });
  });
});
