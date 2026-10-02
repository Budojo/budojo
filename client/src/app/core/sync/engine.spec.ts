import { describe, expect, it } from 'vitest';
import { fromUtf8, utf8 } from './bytes';
import { EMPTY_LEDGER, SyncContext, SyncLedger, syncOnce, SyncServer } from './engine';
import { importSyncKey, newSyncKey } from './envelope';
import { ServerFile, SyncFilesApi } from './files';
import { JournalEntry } from './journal';
import { MemoryRemote, SyncRemote } from './remote';

/**
 * The sync engine (#2046, PRD § 5.2): two devices of one academy, a PC and a
 * phone, each with its own server, meeting in one folder. The folder is in
 * memory; the servers keep their database as a small JSON the engine only
 * ever carries as bytes, as it carries SQLite.
 */

interface Database {
  academy: string | null;
  rows: string[];
  /** Per device, the newest of its entries this database holds: what `/sync/holds` answers. */
  dealt: Record<string, string>;
}

const NO_FILES: SyncFilesApi = {
  list: async (): Promise<ServerFile[]> => [],
  read: async () => new Uint8Array(),
  write: async () => undefined,
};

let counter = 0;
/** A ULID that only grows, as a device's entry ids do. */
function nextId(): string {
  counter++;
  return `01K6F3Q8Z4M7X2N5P9R1T3V${String(counter).padStart(3, '0')}`;
}

class Device implements SyncServer {
  db: Database;
  kept: JournalEntry[] = [];
  private staged: Uint8Array | null = null;
  ledger: SyncLedger = EMPTY_LEDGER;
  readonly files = NO_FILES;

  constructor(
    readonly id: string,
    academy: string | null,
  ) {
    this.db = { academy, rows: [], dealt: {} };
  }

  /** A write through the device's API: a row, and its journal entry in the same transaction. */
  write(row: string): void {
    const id = nextId();
    this.db.rows.push(row);
    this.db.dealt[this.id] = id;
    this.kept.push({
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

  async exportDatabase() {
    return {
      database: utf8(JSON.stringify(this.db)),
      schema: '2026_10_02_100000_create_sync_journal_tables',
    };
  }

  async stage(database: Uint8Array) {
    this.staged = database;
  }

  swapIn(): void {
    if (this.staged !== null) {
      this.db = JSON.parse(fromUtf8(this.staged)) as Database;
      this.staged = null;
    }
  }

  async journal() {
    return [...this.kept];
  }

  async clearJournal(through: string) {
    this.kept = this.kept.filter((entry) => entry.id > through);
  }

  async holds() {
    return { ...this.db.dealt };
  }

  async holdsAcademy() {
    return this.db.academy !== null;
  }
}

async function folder(): Promise<{ remote: MemoryRemote; key: CryptoKey }> {
  return { remote: new MemoryRemote(), key: await importSyncKey(newSyncKey()) };
}

function sync(device: Device, remote: SyncRemote, key: CryptoKey) {
  const context: SyncContext = {
    device: device.id,
    app: '2.76.0',
    key,
    remote,
    server: device,
    shell: { swapIn: async () => device.swapIn() },
    ledger: device.ledger,
    saveLedger: (ledger) => {
      device.ledger = ledger;
    },
    now: () => Date.parse('2026-10-02T18:00:00Z'),
  };
  return syncOnce(context);
}

describe('the sync engine (#2046)', () => {
  it('publishes an academy that never synced as version 1, and says what it holds', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');

    expect(await sync(pc, remote, key)).toEqual({
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

    expect(await sync(phone, remote, key)).toEqual({
      kind: 'pulled',
      version: { seq: 1, device: 'pc4f2a' },
      missingFiles: 0,
    });

    expect(phone.db).toEqual(pc.db);
    expect(phone.ledger.base).toEqual({ seq: 1, device: 'pc4f2a' });
  });

  it('carries what the phone marks at the gym to the PC, which pulls it by itself', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);

    phone.write('Giulia on 2 Oct');
    expect(await sync(phone, remote, key)).toEqual({
      kind: 'pushed',
      version: { seq: 2, device: 'phone9c1e' },
    });
    expect(await sync(pc, remote, key)).toMatchObject({
      kind: 'pulled',
      version: { seq: 2, device: 'phone9c1e' },
    });

    expect(pc.db.rows).toEqual(['Giulia on 2 Oct']);
  });

  it("keeps the phone's write until the PC reports holding it, then clears it", async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);
    phone.write('Giulia on 2 Oct');

    await sync(phone, remote, key);
    expect(phone.kept).toHaveLength(1);

    await sync(pc, remote, key);
    expect(await sync(phone, remote, key)).toEqual({ kind: 'nothing' });
    expect(phone.kept).toEqual([]);
    expect(phone.ledger.unconfirmed).toBeNull();
  });

  it('asks the owner when a phone with an academy of its own meets a folder with one: never merged', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', 'Prova');

    expect(await sync(phone, remote, key)).toEqual({
      kind: 'ask',
      latest: { seq: 1, device: 'pc4f2a' },
    });
    expect(phone.db.academy).toBe('Prova');
  });

  it('never fast-forwards over writes of its own: both changed, so it needs the replay', async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);

    pc.write('Luca on 2 Oct');
    await sync(pc, remote, key);
    phone.write('Giulia on 2 Oct');

    expect(await sync(phone, remote, key)).toEqual({
      kind: 'needs-rebase',
      onto: { seq: 2, device: 'pc4f2a' },
    });
    expect(phone.db.rows).toEqual(['Giulia on 2 Oct']);
    expect(phone.kept).toHaveLength(1);
  });

  it("waits for its own push while Drive's listing has not caught up", async () => {
    const { remote, key } = await folder();
    const pc = new Device('pc4f2a', 'Eagles BJJ');
    await sync(pc, remote, key);
    const phone = new Device('phone9c1e', null);
    await sync(phone, remote, key);
    phone.write('Giulia on 2 Oct');
    await sync(phone, remote, key);

    const lagging: SyncRemote = {
      list: async (dir) => {
        const listing = await remote.list(dir);
        return {
          ...listing,
          files: listing.files.filter((file) => !file.path.includes('phone9c1e.000001')),
        };
      },
      read: (path) => remote.read(path),
      write: (path, bytes) => remote.write(path, bytes),
      remove: (path) => remote.remove(path),
    };

    expect(await sync(phone, lagging, key)).toEqual({ kind: 'wait' });
  });
});
