import type { BackupEntry } from './backup.js';
import { describeCopyError, planFolderCopy, type FolderFile } from './folder-copy.js';

/**
 * Orchestrates copying backups into the owner's chosen folder (#1320).
 *
 * The I/O is injected, so what is under test is the order things happen in and
 * what happens when they fail — which is where the damage would be.
 *
 * One rule governs the file: **a failed copy must never cost anything.** The
 * local backup already succeeded before this runs; the worst acceptable outcome
 * of an unplugged drive is that the folder's copy is older than it could be.
 * Never a lost archive, never a crashed main process, and never a deleted file
 * that was not ours.
 */

export interface FolderCopyState {
  /** Absolute path, or null when the owner has not chosen one. */
  folder: string | null;
  lastCopyAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface FolderCopyIO {
  readState: () => Promise<FolderCopyState>;
  writeState: (state: FolderCopyState) => Promise<void>;
  /** Files already in the destination. Throws if it is gone or unreadable. */
  listFolder: (folder: string) => Promise<FolderFile[]>;
  copyInto: (sourcePath: string, folder: string, name: string) => Promise<void>;
  deleteFrom: (folder: string, name: string) => Promise<void>;
  localArchives: () => Promise<BackupEntry[]>;
  log: (line: string) => void;
  now: () => number;
}

export type CopyResult =
  | { ran: false; reason: 'no_folder' }
  | { ran: true; copied: number; deleted: number; error?: string };

export function emptyFolderState(): FolderCopyState {
  return { folder: null, lastCopyAt: null, lastError: null, lastErrorAt: null };
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? code : 'unknown';
}

export class FolderCopyService {
  constructor(
    private readonly io: FolderCopyIO,
    private readonly keep: number,
  ) {}

  async state(): Promise<FolderCopyState> {
    return this.io.readState();
  }

  /** Chosen through the native dialog by the caller; stored here. */
  async setFolder(folder: string | null): Promise<FolderCopyState> {
    const next: FolderCopyState = { ...emptyFolderState(), folder };
    await this.io.writeState(next);
    this.io.log(folder === null ? 'folder: cleared' : `folder: set to ${folder}`);

    return next;
  }

  /**
   * Never throws. The caller is the six-hourly backup task, and an unhandled
   * rejection in the main process is a far worse outcome than a stale copy.
   */
  async copy(): Promise<CopyResult> {
    let state: FolderCopyState | null = null;

    try {
      state = await this.io.readState();

      if (state.folder === null) {
        return { ran: false, reason: 'no_folder' };
      }

      const folder = state.folder;
      const [local, present] = [await this.io.localArchives(), await this.io.listFolder(folder)];
      const plan = planFolderCopy(local, present, this.keep);
      const byName = new Map(local.map((entry) => [entry.name, entry]));

      // Copy FIRST, prune after. Pruning first could delete the only copy in
      // the folder and then fail to write its replacement.
      for (const name of plan.toCopy) {
        const entry = byName.get(name);
        if (entry === undefined) {
          continue;
        }
        await this.io.copyInto(entry.path, folder, name);
        this.io.log(`folder: copied ${name}`);
      }

      for (const name of plan.toDelete) {
        await this.io.deleteFrom(folder, name);
        this.io.log(`folder: pruned ${name}`);
      }

      await this.io.writeState({
        ...state,
        lastCopyAt: new Date(this.io.now()).toISOString(),
        lastError: null,
        lastErrorAt: null,
      });

      return { ran: true, copied: plan.toCopy.length, deleted: plan.toDelete.length };
    } catch (error) {
      const code = errorCode(error);

      // `lastCopyAt` is left alone: "is it working now?" and "how old is the
      // newest copy over there?" are different questions, and the second is the
      // one that matters when this disk dies.
      if (state !== null) {
        await this.io
          .writeState({
            ...state,
            lastError: code,
            lastErrorAt: new Date(this.io.now()).toISOString(),
          })
          .catch(() => undefined);
      }

      this.io.log(`folder: failed (${code})`);

      return { ran: true, copied: 0, deleted: 0, error: code };
    }
  }
}

export { describeCopyError };
