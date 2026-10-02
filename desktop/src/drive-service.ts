import type { BackupEntry } from './backup.js';
import type { Secrets } from './bootstrap.js';
import type { DriveTokens } from './drive-io.js';
import {
  recordFailure,
  recordSuccess,
  unlinkedState,
  type DriveState,
} from './drive-state.js';
import { mergeArchiveViews, planSync, REMOTE_RETENTION, type ArchiveView, type RemoteArchive } from './drive-sync.js';
import { APPDATA_SCOPE, DRIVE_SCOPE } from './drive-auth.js';
import { holdsTheseSecrets, newAcademyKeys, parseAcademyKeys } from './sync-keys.js';

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
  /** The same consent, with the account's hidden application data as well (#2033). */
  authorizeWithAppData: () => Promise<DriveTokens>;
  /** This PC's keys, from the OS keychain (#1254). */
  localSecrets: () => Promise<Secrets>;
  /** Every keys file on the account: Drive allows two of one name. */
  findKeys: (tokens: DriveTokens) => Promise<string[]>;
  readKeys: (tokens: DriveTokens, id: string) => Promise<string>;
  writeKeys: (tokens: DriveTokens, text: string) => Promise<void>;
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

/**
 * Bringing the gym to the phone (#2033). `published`: this PC wrote the keys;
 * `already`: they were on the account and are this PC's. The refusals, each
 * leaving the backup link as it was:
 * - `keys_differ`: the account holds other keys, never overwritten;
 * - `keys_ambiguous`: it holds two keys files, and none is picked;
 * - `scopes_missing`: the consent did not grant both scopes;
 * - `other_account`: the consent was for another Google account;
 * - `link_changed`: Drive was disconnected or relinked meanwhile.
 */
export type PhoneResult =
  | { ok: true; keys: 'published' | 'already' }
  | { ok: false; error: string };

/** Pulls the code off whatever was thrown, without assuming it is a DriveError. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? code : 'unknown';
}

export class DriveSyncService {
  /** The sync in progress, if any. Two at once both upload everything (#2059). */
  private running: Promise<SyncResult> | null = null;

  /**
   * Bumped by every link and unlink. A sync started under an older link is
   * stale: a later call must not join it, and its result must not be written
   * over the new link's state.
   */
  private generation = 0;

  /**
   * State writes, one after another. Each runs its generation check when its
   * turn comes, and a relink bumps the generation in the same turn as its own
   * write, so a stale result either lands before the relink or not at all.
   */
  private writes: Promise<void> = Promise.resolve();

  /** The connection to the phone in progress, if any: two at once could write two keys files. */
  private connecting: Promise<PhoneResult> | null = null;

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
      // Once the keys are with the account, a reconnect (weekly while the app
      // is in Testing) asks for their scope too, so the PC keeps reaching them.
      const keysPublished = (await this.io.readState()).keysPublishedAt !== null;
      const tokens = keysPublished ? await this.io.authorizeWithAppData() : await this.io.authorize();
      const account = await this.io.accountEmail(tokens);
      const folderId = await this.io.ensureFolder(tokens);

      // Written only once everything resolved: a half-written link would show a
      // connected UI that cannot actually upload.
      await this.io.writeTokens(tokens);
      await this.serially(async () => {
        const before = await this.io.readState();
        await this.io.writeState({
          ...unlinkedState(),
          linked: true,
          account,
          folderId,
          // The keys stay on the same account across a reconnect.
          keysPublishedAt: before.account === account ? before.keysPublishedAt : null,
        });
        this.forgetRunningSync();
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
    await this.serially(async () => {
      await this.io.writeState(unlinkedState());
      this.forgetRunningSync();
    });
    this.io.log('unlink: disconnected');
  }

  /**
   * Never throws. The caller is a 6-hourly timer in the main process, and an
   * unhandled rejection there is a worse outcome than a stale cloud copy.
   *
   * **One at a time (#2059).** The timer's first tick lands a minute after
   * launch, which is exactly when a new user connects Drive and presses «Copia
   * adesso». Two syncs both list the folder before either uploads, and both
   * upload every archive. A call that arrives while one runs gets that one's
   * result instead.
   */
  sync(): Promise<SyncResult> {
    if (this.running === null) {
      const run = this.runSync(this.generation).finally(() => {
        // A relink may already have replaced it: clear only this run.
        if (this.running === run) {
          this.running = null;
        }
      });
      this.running = run;
    }

    return this.running;
  }

  /** Runs `work` after every state write queued before it. A failure does not stop the queue. */
  private serially(work: () => Promise<void>): Promise<void> {
    const turn = this.writes.then(work);
    this.writes = turn.catch(() => undefined);
    return turn;
  }

  /** The link changed: the next sync starts fresh, and the running one is stale. */
  private forgetRunningSync(): void {
    this.generation++;
    this.running = null;
  }

  private async runSync(generation: number): Promise<SyncResult> {
    // EVERYTHING is inside the try, including the state read and the failure
    // write. Both touch the disk, and an ENOSPC or EPERM on drive-sync.json
    // would otherwise escape: the 6-hourly caller is guarded, but the IPC
    // bridge returns this promise bare, so a rejection leaves the renderer's
    // spinner turning forever with no message.
    let state: DriveState | null = null;

    try {
      state = await this.io.readState();

      if (!state.linked || state.folderId === null) {
        return { ran: false, reason: 'not_linked' };
      }

      const tokens = await this.authenticated();
      const [local, remote] = [await this.io.localArchives(), await this.io.listRemote(tokens, state.folderId)];
      const plan = planSync(local, remote, REMOTE_RETENTION);

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

      await this.serially(async () => {
        if (generation !== this.generation) {
          this.io.log('sync: the link changed while it ran, result not recorded');
          return;
        }
        // On the state as it is now: a phone connected while this ran keeps its date.
        await this.io.writeState(
          recordSuccess(await this.io.readState(), { at: this.io.now(), uploaded: plan.toUpload.length }),
        );
      });

      return { ran: true, uploaded: plan.toUpload.length, deleted: plan.toDelete.length };
    } catch (error) {
      const code = errorCode(error);

      // Best effort: if the state read itself failed there is nothing to record
      // against, and a second disk error here must not become the thing that
      // throws.
      if (state !== null) {
        await this.serially(async () => {
          if (generation === this.generation) {
            await this.io.writeState(recordFailure(await this.io.readState(), { at: this.io.now(), error: code }));
          }
        }).catch(() => undefined);
      }

      this.io.log(`sync: failed (${code})`);

      return { ran: true, uploaded: 0, deleted: 0, error: code };
    }
  }

  /**
   * Brings the gym to the phone (#2033, PRD § 5.4): asks Google for the
   * account's hidden application data, then makes sure the academy's keys are
   * there, for a phone to read after «Accedi con Google».
   *
   * - **None there:** this PC writes them, with its own two keys.
   * - **This PC's there:** nothing to write.
   * - **Another academy's there** (a phone set up on its own, a second PC):
   *   never overwritten. Its documents and its sync would stop opening.
   */
  connectPhone(): Promise<PhoneResult> {
    if (this.connecting === null) {
      this.connecting = this.runConnectPhone().finally(() => {
        this.connecting = null;
      });
    }

    return this.connecting;
  }

  private async runConnectPhone(): Promise<PhoneResult> {
    const generation = this.generation;
    try {
      const state = await this.io.readState();
      if (!state.linked) {
        return { ok: false, error: 'not_linked' };
      }
      const tokens = await this.io.authorizeWithAppData();
      // Each check before the tokens replace the working ones: a refusal leaves
      // the backups exactly as they were.
      const granted = (tokens.scope ?? '').split(' ');
      if (!granted.includes(DRIVE_SCOPE) || !granted.includes(APPDATA_SCOPE)) {
        this.io.log('phone: the consent did not grant both scopes');

        return { ok: false, error: 'scopes_missing' };
      }
      const account = await this.io.accountEmail(tokens);
      if (account === null || account !== state.account) {
        this.io.log('phone: the consent was for another account');
        await this.io.revoke(tokens.refreshToken).catch(() => undefined);

        return { ok: false, error: 'other_account' };
      }
      if (generation !== this.generation) {
        return { ok: false, error: 'link_changed' };
      }
      await this.io.writeTokens(tokens);
      const outcome = await this.publishKeys(tokens);
      if (outcome !== 'published' && outcome !== 'already') {
        return { ok: false, error: outcome };
      }
      const at = new Date(this.io.now()).toISOString();
      await this.serially(async () => {
        if (generation === this.generation) {
          await this.io.writeState({ ...(await this.io.readState()), keysPublishedAt: at });
        }
      });
      this.io.log(`phone: keys ${outcome}`);

      return { ok: true, keys: outcome };
    } catch (error) {
      const code = errorCode(error);
      this.io.log(`phone: failed (${code})`);

      return { ok: false, error: code };
    }
  }

  /** Writes this PC's keys when the account has none; never over other keys, never beside a second file. */
  private async publishKeys(tokens: DriveTokens): Promise<'published' | 'already' | 'keys_differ' | 'keys_ambiguous'> {
    const secrets = await this.io.localSecrets();
    const existing = await this.io.findKeys(tokens);
    if (existing.length > 1) {
      this.io.log('phone: the account holds two keys files, none is picked');

      return 'keys_ambiguous';
    }
    const [only] = existing;
    if (only === undefined) {
      await this.io.writeKeys(tokens, JSON.stringify(newAcademyKeys(secrets, new Date(this.io.now()))));

      return 'published';
    }
    if (holdsTheseSecrets(parseAcademyKeys(await this.io.readKeys(tokens, only)), secrets)) {
      return 'already';
    }
    this.io.log('phone: the account holds other keys, left as they are');

    return 'keys_differ';
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
