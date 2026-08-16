import type { BackupEntry } from './backup.js';
import type { DriveTokens } from './drive-io.js';
import {
  recordFailure,
  recordSuccess,
  unlinkedState,
  type DriveState,
} from './drive-state.js';
import { mergeArchiveViews, planSync, REMOTE_KEEP, type ArchiveView, type RemoteArchive } from './drive-sync.js';

/**
 * Orchestrates the Drive backup sync (#1301): link, sync, unlink.
 *
 * Same shape as `BackupService` (#1228) — the I/O is injected, so what lives
 * here is the order things happen in and what happens when they fail. Both are
 * under test; `drive-io.ts` supplies the real implementation.
 *
 * One rule governs the whole file: **a sync failure must never cost the user
 * anything.** The local backup already succeeded before this runs. The worst
 * acceptable outcome of a bad network day is that the cloud copy is older than
 * it could be — never a lost archive, never a crashed main process.
 */

export interface DriveSyncIO {
  readState: () => Promise<DriveState>;
  writeState: (state: DriveState) => Promise<void>;

  /** Tokens live in the OS keychain via safeStorage, never in the state file. */
  readTokens: () => Promise<DriveTokens | null>;
  writeTokens: (tokens: DriveTokens) => Promise<void>;
  clearTokens: () => Promise<void>;

  authorize: () => Promise<DriveTokens>;
  ensureFresh: (tokens: DriveTokens) => Promise<DriveTokens>;
  accountEmail: (tokens: DriveTokens) => Promise<string | null>;
  ensureFolder: (tokens: DriveTokens) => Promise<string>;
  listRemote: (tokens: DriveTokens, folderId: string) => Promise<RemoteArchive[]>;
  upload: (tokens: DriveTokens, folderId: string, filePath: string, name: string) => Promise<void>;
  remove: (tokens: DriveTokens, fileId: string) => Promise<void>;
  revoke: (refreshToken: string) => Promise<void>;

  localArchives: () => Promise<BackupEntry[]>;
  log: (line: string) => void;
  now: () => number;
}

export type SyncResult =
  | { ran: false; reason: 'not_linked' }
  | { ran: true; uploaded: number; deleted: number; error?: string };

export type LinkResult = { ok: true; account: string | null } | { ok: false; error: string };

/** Pulls the code off whatever was thrown, without assuming it is a DriveError. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? code : 'unknown';
}

export class DriveSyncService {
  constructor(private readonly io: DriveSyncIO) {}

  async state(): Promise<DriveState> {
    return this.io.readState();
  }

  /** Local and remote archives as one list, so a fresh machine still sees the account's. */
  async archives(): Promise<ArchiveView[]> {
    const local = await this.io.localArchives();
    const state = await this.io.readState();

    if (!state.linked || state.folderId === null) {
      return mergeArchiveViews(local, []);
    }

    try {
      const tokens = await this.authenticated();

      return mergeArchiveViews(local, await this.io.listRemote(tokens, state.folderId));
    } catch (error) {
      // Listing is for display. Failing it must not blank the local list, which
      // is the half that always works.
      this.io.log(`archives: remote list failed (${errorCode(error)})`);

      return mergeArchiveViews(local, []);
    }
  }

  async link(): Promise<LinkResult> {
    try {
      const tokens = await this.io.authorize();
      const account = await this.io.accountEmail(tokens);
      const folderId = await this.io.ensureFolder(tokens);

      // Written only once everything resolved: a half-written link would show a
      // connected UI that cannot actually upload.
      await this.io.writeTokens(tokens);
      await this.io.writeState({
        ...unlinkedState(),
        linked: true,
        account,
        folderId,
      });

      this.io.log(`link: connected ${account ?? 'unknown account'}`);

      return { ok: true, account };
    } catch (error) {
      const code = errorCode(error);
      this.io.log(`link: failed (${code})`);

      return { ok: false, error: code };
    }
  }

  async unlink(): Promise<void> {
    const tokens = await this.io.readTokens();

    if (tokens !== null) {
      // Best effort: Google being unreachable must not leave the app believing
      // it is still linked.
      await this.io.revoke(tokens.refreshToken).catch(() => undefined);
    }

    await this.io.clearTokens();
    await this.io.writeState(unlinkedState());
    this.io.log('unlink: disconnected');
  }

  /**
   * Never throws. The caller is a 6-hourly timer in the main process, and an
   * unhandled rejection there is a worse outcome than a stale cloud copy.
   */
  async sync(): Promise<SyncResult> {
    const state = await this.io.readState();

    if (!state.linked || state.folderId === null) {
      return { ran: false, reason: 'not_linked' };
    }

    try {
      const tokens = await this.authenticated();
      const [local, remote] = [await this.io.localArchives(), await this.io.listRemote(tokens, state.folderId)];
      const plan = planSync(local, remote, REMOTE_KEEP);

      const byName = new Map(local.map((entry) => [entry.name, entry]));

      // Upload FIRST, then prune. A prune that ran first could delete the only
      // remote copy and then fail to upload its replacement.
      for (const name of plan.toUpload) {
        const entry = byName.get(name);
        if (entry === undefined) {
          continue;
        }
        await this.io.upload(tokens, state.folderId, entry.path, name);
        this.io.log(`sync: uploaded ${name}`);
      }

      for (const fileId of plan.toDelete) {
        await this.io.remove(tokens, fileId);
        this.io.log(`sync: pruned remote ${fileId}`);
      }

      await this.io.writeState(
        recordSuccess(state, { at: this.io.now(), uploaded: plan.toUpload.length }),
      );

      return { ran: true, uploaded: plan.toUpload.length, deleted: plan.toDelete.length };
    } catch (error) {
      const code = errorCode(error);
      await this.io.writeState(recordFailure(state, { at: this.io.now(), error: code }));
      this.io.log(`sync: failed (${code})`);

      return { ran: true, uploaded: 0, deleted: 0, error: code };
    }
  }

  /** Reads the tokens and refreshes them if they are near expiry. */
  private async authenticated(): Promise<DriveTokens> {
    const stored = await this.io.readTokens();

    if (stored === null) {
      throw Object.assign(new Error('no tokens'), { code: 'invalid_grant' });
    }

    const fresh = await this.io.ensureFresh(stored);

    // A refresh mints a new access token; persisting it means the next sync
    // does not have to ask again.
    if (fresh.accessToken !== stored.accessToken) {
      await this.io.writeTokens(fresh);
    }

    return fresh;
  }
}
