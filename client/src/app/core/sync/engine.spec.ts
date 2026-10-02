import { describe, expect, it } from 'vitest';
import { fromUtf8, sha256Hex, utf8 } from './bytes';
import { EMPTY_LEDGER, SyncContext, SyncLedger, syncOnce, SyncServer } from './engine';
import { importSyncKey, newSyncKey, seal } from './envelope';
import { ServerFile, SyncFilesApi } from './files';
import { JournalEntry } from './journal';
import { devicePath, filePath } from './layout';
import { MemoryRemote, SyncRemote } from './remote';

/**
 * The sync engine (#2046, PRD § 5.2): two devices of one academy, a PC and a
 * phone, each with its own server, meeting in one folder in memory.
 *
 * Each server keeps its database as a small JSON the engine only carries as
 * bytes, as it carries SQLite, and **its journal is inside it**, as
 * `sync_journal` is: a swap replaces it, and after the swap a device keeps
 * only its own rows (the reconcile).
 */

interface Database {
  academy: string | null;
  rows: string[];
  /** Per device, the newest of its entries this database holds: what `/sync/holds` answers. */
  dealt: Record<string, string>;
  /** `sync_journal`: the kept entries. */
  journal: JournalEntry[];
  /** The contents its rows name, by SHA-256. */
  names: string[];
}

let counter = 0;
/** A ULID that only grows, as a device's entry ids do. */
function nextId(): string {
  counter++;
  return `01K6F3Q8Z4M7X2N5P9R1T3V${String(counter).padStart(3, '0')}`;
}

class Device implements SyncServer {
  db: Database;
  private staged: Uint8Array | null = null;
  ledger: SyncLedger = EMPTY_LEDGER;
  /** True while the page's writes are held: the stage and the swap must happen inside. */
  holding = false;
  /** What happened while the writes were held, and what outside. */
  readonly under: string[] = [];
  /** The bytes this device holds, by SHA-256. */
  readonly held = new Map<string, Uint8Array>();
  readonly files: SyncFilesApi = {
    list: async (): Promise<ServerFile[]> =>
      this.db.names.map((sha256) => ({
        sha256,
        size: this.held.get(sha256)?.length ?? null,
        present: this.held.has(sha256),
        complete: this.held.has(sha256),
      })),
    read: async (sha256) => this.held.get(sha256) as Uint8Array,
    write: async (sha256, bytes) => {
      this.held.set(sha256, bytes);
    },
  };

  constructor(
    readonly id: string,
    academy: string | null,
  ) {
    this.db = { academy, rows: [], dealt: {}, journal: [], names: [] };
  }

  /** A write through the device's API: a row, and its journal entry in the same transaction. */
  write(row: string): void {
    const id = nextId();
    this.db.rows.push(row);
    this.db.dealt[this.id] = id;
    this.db.journal.push({
      id,
      device: this.id,
      at: '2026-10-02T18:00:00.000000Z',
      method: 'POST',
      route: 'attendance.store',
      params: {},
      body: { row },
      created: {},
      before: null,
    });
  }

  async photo(text: string): Promise<string> {
    const bytes = utf8(text);
    const sha = await sha256Hex(bytes);
    this.db.names.push(sha);
    this.held.set(sha, bytes);
    return sha;
  }

  async exportDatabase() {
    return {
      database: utf8(JSON.stringify(this.db)),
      schema: '2026_10_02_100000_create_sync_journal_tables',
    };
  }

  async stage(database: Uint8Array) {
    this.under.push(`stage ${this.holding ? 'held' : 'open'}`);
    this.staged = database;
  }

  /** The shell's swap, then the reconcile: the journal keeps only this device's rows. */
  swapIn(): void {
    this.under.push(`swap ${this.holding ? 'held' : 'open'}`);
    if (this.staged !== null) {
      this.db = JSON.parse(fromUtf8(this.staged)) as Database;
      this.db.journal = this.db.journal.filter((entry) => entry.device === this.id);
      this.staged = null;
    }
  }

  async journal() {
    return this.db.journal.filter((entry) => entry.device === this.id);
  }

  async clearJournal(through: string) {
    this.db.journal = this.db.journal.filter((entry) => entry.id > through);
  }

  async holds() {
    return { ...this.db.dealt };
  }

  async holdsAcademy() {
    return this.db.academy !== null;
  }
}

const MINUTE = 60_000;

async function folder(clock?: () => number): Promise<{ remote: MemoryRemote; key: CryptoKey }> {
  return { remote: new MemoryRemote(clock), key: await importSyncKey(newSyncKey()) };
}

function sync(
  device: Device,
  remote: SyncRemote,
  key: CryptoKey,
  holdWrites = async <T>(work: () => Promise<T>): Promise<T> => {
    device.holding = true;
    try {
      return await work();
    } finally {
      device.holding = false;
    }
  },
  swapIn: () => Promise<void> = async () => device.swapIn(),
) {
  const context: SyncContext = {
    device: device.id,
    app: '2.76.0',
    key,
    remote,
    server: device,
    shell: { swapIn },
    ledger: device.ledger,
    saveLedger: (ledger) => {
      device.ledger = ledger;
    },
    holdWrites,
    now: () => Date.parse('2026-10-02T18:00:00Z'),
  };
  return syncOnce(context);
}

async function outcome(device: Device, remote: SyncRemote, key: CryptoKey) {
  return (await sync(device, remote, key)).outcome;
}

/** A remote whose listing hides some files, as Drive's lags behind a new one. */
function lagging(remote: MemoryRemote, hides: (path: string) => boolean): SyncRemote {
  return {
    list: async (dir) => {
      const listing = await remote.list(dir);
      return { ...listing, files: listing.files.filter((file) => !hides(file.path)) };
    },
    read: (path) => remote.read(path),
    write: (path, bytes) => remote.write(path, bytes),
    remove: (path) => remote.remove(path),
  };
}

/** A PC with its academy at version 1, and a phone that pulled it. */
async function twoDevices() {
  const { remote, key } = await folder();
  const pc = new Device('pc4f2a', 'Eagles BJJ');
  await sync(pc, remote, key);
  const phone = new Device('phone9c1e', null);
  await sync(phone, remote, key);
  return { remote, key, pc, phone };
}

describe('the sync engine (#2046)', () => {
  it('publishes an academy that never synced as version 1, and says what it holds', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');

    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 1, device: 'pc4f2a' },
    });

    expect([...remote.files.keys()].sort()).toEqual([
      'devices/pc4f2a.bjs',
      'versions/000001-pc4f2a.root.bjs',
    ]);
    expect(pc.ledger.base).toEqual({ seq: 1, device: 'pc4f2a' });
  });

  it("brings that version to a phone that holds nothing: the PC's academy, swapped in", async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    pc.write('Luca on 1 Oct');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pulled',
      version: { seq: 1, device: 'pc4f2a' },
    });

    expect(phone.db.rows).toEqual(pc.db.rows);
    expect(phone.ledger.base).toEqual({ seq: 1, device: 'pc4f2a' });
  });

  it('carries what the phone marks at the gym to the PC, which pulls it by itself', async () => {
    const { remote, key, pc, phone } = await twoDevices();

    phone.write('Giulia on 2 Oct');
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 2, device: 'phone9c1e' },
    });
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pulled',
      version: { seq: 2, device: 'phone9c1e' },
    });

    expect(pc.db.rows).toEqual(['Giulia on 2 Oct']);
  });

  it("keeps the phone's write until the PC reports holding it, then clears it", async () => {
    const { remote, key, pc, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');

    await sync(phone, remote, key);
    expect(await phone.journal()).toHaveLength(1);

    await sync(pc, remote, key);
    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(await phone.journal()).toEqual([]);
    expect(phone.ledger.unconfirmed).toBeNull();
  });

  it('asks the owner when a phone with an academy of its own meets a folder with one, and still reports', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', 'Prova');

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'pc4f2a' },
    });
    expect(phone.db.academy).toBe('Prova');
    expect(remote.files.has(devicePath('phone9c1e'))).toBe(true);
  });

  it('never fast-forwards over writes of its own: both changed, so it needs the replay', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Giulia on 2 Oct');

    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'needs-rebase',
      onto: { seq: 2, device: 'pc4f2a' },
    });
    expect(phone.db.rows).toEqual(['Giulia on 2 Oct']);
    expect(await phone.journal()).toHaveLength(1);
  });

  it("waits for its own push while Drive's listing has not caught up", async () => {
    const { remote, key, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    expect(
      await outcome(
        phone,
        lagging(remote, (path) => path.includes('phone9c1e.000001')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
  });
});

describe('a write the round must not lose (#2086 review)', () => {
  it('swaps nothing when a check-in lands while the version downloads: the round decides again', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    // The owner marks a presence while the phone is still reading the version.
    const reading: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: async (path) => {
        if (path.startsWith('versions/')) {
          phone.write('Giulia on 2 Oct');
        }
        return remote.read(path);
      },
      write: (path, bytes) => remote.write(path, bytes),
      remove: (path) => remote.remove(path),
    };

    expect((await sync(phone, reading, key)).outcome).toEqual({ kind: 'retry' });
    expect(phone.db.rows).toEqual(['Giulia on 2 Oct']);
    expect(await phone.journal()).toHaveLength(1);
    expect(await outcome(phone, remote, key)).toEqual({
      kind: 'needs-rebase',
      onto: { seq: 2, device: 'pc4f2a' },
    });
  });

  it("stages and swaps only while the page's writes are held", async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.under.length = 0;

    await sync(phone, remote, key);

    expect(phone.under).toEqual(['stage held', 'swap held']);
    expect(phone.db.rows).toEqual(['Luca on 2 Oct']);
  });

  it('knows its new base once staged: a phone killed during the restart wakes up as that version', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);

    await expect(
      sync(phone, remote, key, undefined, async () => {
        throw new Error('killed during the restart');
      }),
    ).rejects.toThrow('killed');

    expect(phone.ledger.base).toEqual({ seq: 2, device: 'pc4f2a' });
  });

  it('takes a push whose answer was lost as pushed: once listed, it is the base, and nothing is sent twice', async () => {
    const { remote, key, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    let writes = 0;
    const lostAnswer: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        await remote.write(path, bytes);
        if (path.startsWith('versions/')) {
          writes++;
          throw new Error('the connection dropped before the answer');
        }
      },
      remove: (path) => remote.remove(path),
    };

    await expect(sync(phone, lostAnswer, key)).rejects.toThrow('dropped');
    expect(phone.ledger.unconfirmed?.version).toEqual({ seq: 2, device: 'phone9c1e' });

    expect(await outcome(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(phone.ledger.base).toEqual({ seq: 2, device: 'phone9c1e' });
    expect(writes).toBe(1);
  });

  it('counts the wait for its push from the first listing after it, not from before a long upload', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    // Eleven minutes on, a listing that still lacks it: the first since the push.
    now += 11 * MINUTE;
    expect(
      await outcome(
        phone,
        lagging(remote, (path) => path.includes('phone9c1e.000001')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
  });
});

describe('what the round reads and fetches (#2086 review)', () => {
  it('takes a report for the device its path names, or as holding nothing: never clears on a mislabelled one', async () => {
    const { remote, key, pc, phone } = await twoDevices();
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);
    await sync(pc, remote, key);
    // The PC's file now speaks for another device.
    const path = devicePath('pc4f2a');
    const forged = {
      v: 1,
      device: 'tablet1a2b',
      base: null,
      holds: await pc.holds(),
      at: '2026-10-02T18:00:00Z',
    };
    await remote.write(path, await seal(key, path, utf8(JSON.stringify(forged))));

    await sync(phone, remote, key);

    expect(await phone.journal()).toHaveLength(1);
  });

  it('fetches a file the folder did not have yet at a later round', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    const sha = await pc.photo('a photo');
    await sync(pc, remote, key);
    const sealed = await remote.read(filePath(sha));
    await remote.remove(filePath(sha));
    const phone = new Device('phone9c1e', null);

    expect((await sync(phone, remote, key)).missingFiles).toBe(1);

    await remote.write(filePath(sha), sealed as Uint8Array);
    expect(await sync(phone, remote, key)).toEqual({
      outcome: { kind: 'nothing' },
      missingFiles: 0,
    });
    expect(phone.held.has(sha)).toBe(true);
  });

  it('clears no entry of a push that never reached Drive, and publishes it again after the lag', async () => {
    let now = 1_000_000;
    const { remote, key } = await folder(() => now);
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    pc.write('Luca on 2 Oct');
    const unreachable: SyncRemote = {
      list: (dir) => remote.list(dir),
      read: (path) => remote.read(path),
      write: async (path, bytes) => {
        if (path.startsWith('versions/')) {
          throw new Error('no network');
        }
        await remote.write(path, bytes);
      },
      remove: (path) => remote.remove(path),
    };

    await expect(sync(pc, unreachable, key)).rejects.toThrow('no network');
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'wait' });
    expect(await pc.journal()).toHaveLength(1);

    now += 11 * MINUTE;
    expect(await outcome(pc, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 2, device: 'pc4f2a' },
    });
    expect(await outcome(pc, remote, key)).toEqual({ kind: 'nothing' });
    expect(await pc.journal()).toEqual([]);
  });

  it('waits for a push that carried no entry while Drive has not listed it: no second version over it', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);

    // Version 1 holds the academy and no entry; the listing lags behind it.
    expect(
      await outcome(
        pc,
        lagging(remote, (path) => path.includes('000001-pc4f2a')),
        key,
      ),
    ).toEqual({
      kind: 'wait',
    });
    expect([...remote.files.keys()].filter((path) => path.startsWith('versions/'))).toEqual([
      'versions/000001-pc4f2a.root.bjs',
    ]);
  });
});
