import { fromUtf8, sha256Hex, utf8 } from '../bytes';
import { EMPTY_LEDGER, SyncLedger, SyncServer } from '../engine';
import { ServerFile, SyncFilesApi } from '../files';
import { Homecoming } from '../homecoming';
import { JournalEntry } from '../journal';

/**
 * A device's own server, in memory, for the sync's tests (#2046). It keeps its
 * database as a small JSON the engine only carries as bytes, as it carries
 * SQLite, and **its journal is inside it**, as `sync_journal` is: a swap
 * replaces it, and after the swap a device keeps only its own rows (the
 * reconcile). **A rebase replays** as the server's does (#2031 step 3): the
 * kept entries, set aside at the stage, each skipped when the swapped-in
 * database holds it, found already true when its row is there, applied
 * otherwise; every one not skipped is kept again.
 */

export interface Database {
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

export class MemoryDevice implements SyncServer {
  db: Database;
  private staged: Uint8Array | null = null;
  /** The kept entries a rebase's stage set aside, for the replay after the swap. */
  private setAside: JournalEntry[] | null = null;
  /** What the last replay did, by entry id. */
  replayed: Record<string, 'skipped' | 'applied' | 'already'> = {};
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

  async stage(database: Uint8Array, options?: { rebase: boolean }) {
    this.under.push(`stage${options?.rebase ? ' rebase' : ''} ${this.holding ? 'held' : 'open'}`);
    this.setAside = options?.rebase ? await this.journal() : null;
    this.staged = database;
  }

  /** The shell's swap, then the reconcile: a rebase's replay, and the journal keeps only this device's rows. */
  swapIn(): void {
    this.under.push(`swap ${this.holding ? 'held' : 'open'}`);
    if (this.staged !== null) {
      this.db = JSON.parse(fromUtf8(this.staged)) as Database;
      this.db.journal = this.db.journal.filter((entry) => entry.device === this.id);
      this.staged = null;
    }
    if (this.setAside !== null) {
      this.replay(this.setAside);
      this.setAside = null;
    }
  }

  private replay(entries: JournalEntry[]): void {
    this.replayed = {};
    for (const entry of entries) {
      const held = this.db.dealt[entry.device];
      if (held !== undefined && held >= entry.id) {
        this.replayed[entry.id] = 'skipped';
        continue;
      }
      const row = (entry.body as { row: string }).row;
      const already = this.db.rows.includes(row);
      if (!already) {
        this.db.rows.push(row);
      }
      this.replayed[entry.id] = already ? 'already' : 'applied';
      this.db.dealt[entry.device] = entry.id;
      this.db.journal.push(entry);
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

  /** What the other device's work brought, as the reconcile kept it (#2039). */
  arrived: Homecoming | null = null;

  async homecoming(): Promise<Homecoming | null> {
    return this.arrived;
  }

  async seenHomecoming(through: string): Promise<void> {
    if (this.arrived?.through === through) {
      this.arrived = null;
    }
  }
}
