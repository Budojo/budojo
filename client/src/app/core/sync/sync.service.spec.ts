import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncOnce } from './engine';
import { importSyncKey, newSyncKey } from './envelope';
import { sealFolder } from './folder';
import { HttpSyncServer } from './http-sync-server';
import { FOLDER_PATH } from './layout';
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
    expect(loadLedger(phone.id).base).toEqual({ seq: 1, device: 'pc4f2a' });
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

    expect(sync.state()).toEqual({ kind: 'ask', latest: { seq: 1, device: 'pc4f2a' } });
    expect(phone.db.academy).toBe('Eagles BJJ, restored from a backup');
    expect(reload).not.toHaveBeenCalled();
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
