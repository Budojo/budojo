import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { VERSION } from '../../../environments/version';
import { versionsIn } from './decide';
import { AskChoice, resolveAsk, SyncContext, SyncLedger, SyncShell, syncOnce } from './engine';
import { importSyncKey } from './envelope';
import { checkFolder, hasRoomFor } from './folder';
import { HttpSyncServer } from './http-sync-server';
import { VersionRef } from './layout';
import { LedgerOwner, loadLedger, saveLedger, savedOwner } from './ledger-store';
import { RemoteError, SyncRemote } from './remote';
import { appVersionOf } from './version';
import { WriteGate } from './write-gate';

/** This device's place in the academy's sync, from the keys it joined with (protocol § Joining). */
export interface SyncIdentity {
  device: string;
  /** The folder id the keys file named: `folder.bjs` must name the same. */
  folder: string;
  /** 32 bytes, base64. */
  syncKey: string;
  /** Moved on when the database is put back in time outside the sync (the PC's Restore): see `ledger-store.ts`. */
  epoch?: number;
}

/** What each shell supplies (PRD § 5.6): the engine and its timing are the same on both. */
export interface SyncPlatform {
  /** Null until this device joined the academy's sync. */
  identity(): Promise<SyncIdentity | null>;
  /** The folder on Drive. Fails with `RemoteError('unauthorized')` when Google wants the owner again. */
  remote: SyncRemote;
  shell: SyncShell;
  /**
   * Whether this device publishes its academy into a folder with no version
   * yet. The device that made the keys does; one that joined with them
   * waits for it, rather than make the other device's academy ask.
   */
  publishesFirst: boolean;
  /** Asks Google again, on the owner's tap: in Testing it lets go every week (#2028). */
  reconnect(): Promise<void>;
}

/** The shell's sync, or null where there is none: the web, and a shell without it yet. */
export const SYNC_PLATFORM = new InjectionToken<SyncPlatform | null>('SYNC_PLATFORM', {
  providedIn: 'root',
  factory: () => null,
});

/** How the page shows the database a fast-forward swapped in: loaded again from the start. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => () => location.reload(),
});

/** What the sync pill says (PRD § 6.2). */
export type SyncState =
  /** Not joined, or no sync on this runtime: no pill. */
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  /** Writes in no version yet, with no way to send them now. */
  | { kind: 'pending'; count: number; offline: boolean }
  /** The folder holds no academy yet: the device that made the keys publishes it. */
  | { kind: 'waiting-first' }
  | { kind: 'reconnect' }
  /** Two academies, or a folder behind this device: the owner chooses (§ 6.4, § 6.5). */
  | {
      kind: 'ask';
      latest: VersionRef;
      /** The latest is this device's own: after a Restore, it is not «the other device's». */
      mine: boolean;
    }
  /** `folder.bjs` names another folder, or is missing from one that holds versions. */
  | { kind: 'another-folder' }
  /** The sync key rotated: this device was unpaired. */
  | { kind: 'unpaired' }
  /** Two other devices already sync with the folder: a third is refused (protocol § Scope). */
  | { kind: 'full' }
  | { kind: 'failed'; reason: string };

/** A few seconds after a write, the push: a burst of taps makes one version (PRD § 5.2). */
export const PUSH_DELAY_MS = 5_000;
/** While the app is in front, a look for the other device's work. */
export const LOOK_EVERY_MS = 5 * 60_000;
/** Drive's listing has not shown a push yet: look again soon. */
export const WAIT_RETRY_MS = 60_000;
/** After a failure: again later, not in a loop. */
export const FAILURE_RETRY_MS = 2 * 60_000;

/**
 * When the sync runs, and what it says (#2046, PRD § 5.2, § 6.2): on opening,
 * on coming back to the front, a few seconds after a write, on regaining the
 * network, and every few minutes while the app is in front. One round at a
 * time (`SyncContext`); a reason to sync during a round runs one more after.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly platform = inject(SYNC_PLATFORM);
  private readonly server = inject(HttpSyncServer);
  private readonly gate = inject(WriteGate);
  private readonly reload = inject(PAGE_RELOAD);

  private readonly stateSignal = signal<SyncState>({ kind: 'off' });
  readonly state = this.stateSignal.asReadonly();

  /**
   * How many writes a rebase set aside wait for the owner (#2038): «N da
   * decidere» on the pill, which leads to the screen that answers them.
   * Read after every round, and again after every answer.
   */
  private readonly toDecideSignal = signal(0);
  readonly toDecide = this.toDecideSignal.asReadonly();

  /** What `stop` undoes; null while stopped. */
  private stopping: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dueAt = 0;
  private running: Promise<void> | null = null;
  private again = false;
  private key: { raw: string; key: CryptoKey } | null = null;
  /** Whose ledger the last round used: an identity that cannot be read offline still counts what waits. */
  private lastOwner: LedgerOwner | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Once the owner is signed in. Nothing happens on a runtime with no sync. */
  start(): void {
    if (this.stopping !== null || this.platform === null) {
      return;
    }
    const written = this.gate.written$.subscribe(() => this.schedule(PUSH_DELAY_MS));
    const inFront = (): void => {
      if (document.visibilityState === 'visible') {
        this.schedule(0);
      }
    };
    const online = (): void => this.schedule(0);
    document.addEventListener('visibilitychange', inFront);
    window.addEventListener('online', online);
    const looking = setInterval(inFront, LOOK_EVERY_MS);
    this.stopping = () => {
      written.unsubscribe();
      document.removeEventListener('visibilitychange', inFront);
      window.removeEventListener('online', online);
      clearInterval(looking);
      this.cancelTimer();
    };
    this.schedule(0);
  }

  /**
   * When the owner signs out (the shell that started it goes): no round is
   * started while the door may bring another database in, and the next
   * sign-in starts again with a round of its own. A round already running
   * finishes.
   */
  stop(): void {
    this.stopping?.();
    this.stopping = null;
    this.stateSignal.set({ kind: 'off' });
  }

  /** «Sincronizza ora». */
  syncNow(): Promise<void> {
    this.cancelTimer();
    return this.run();
  }

  /**
   * The owner's answer when the sync asked (PRD § 5.4, § 6.5): whose academy
   * the folder carries on with. After any round already running, and only on
   * the folder the owner was asked about (`resolveAsk`).
   */
  async resolve(choice: AskChoice, seen: VersionRef): Promise<void> {
    while (this.running !== null) {
      await this.running;
    }
    // Looked at after the wait: a round meanwhile may have answered the
    // question, or the owner signed out.
    if (this.stateSignal().kind !== 'ask') {
      return;
    }
    this.cancelTimer();
    await this.run({ choice, seen });
  }

  /** «Ricollega Google», then a round. */
  async reconnect(): Promise<void> {
    if (this.platform === null) {
      return;
    }
    await this.platform.reconnect();
    await this.syncNow();
  }

  private schedule(delayMs: number): void {
    if (this.stopping === null) {
      return;
    }
    const due = Date.now() + delayMs;
    if (this.timer !== null) {
      if (this.dueAt <= due) {
        return;
      }
      clearTimeout(this.timer);
    }
    this.dueAt = due;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private run(resolution?: { choice: AskChoice; seen: VersionRef }): Promise<void> {
    if (this.running !== null) {
      this.again = true;
      return this.running;
    }
    this.running = this.round(resolution).finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    });
    return this.running;
  }

  private async round(resolution?: { choice: AskChoice; seen: VersionRef }): Promise<void> {
    const platform = this.platform;
    let identity: SyncIdentity | null;
    try {
      identity = platform === null ? null : await platform.identity();
    } catch (error) {
      // On the PC the identity reads the keys from the account: no network,
      // or Google letting go, is said as for any round.
      // An app opened with no network has no owner from this launch yet:
      // the one its ledger was saved under.
      await this.failed(error, this.lastOwner ?? savedOwner());
      return;
    }
    if (platform === null || identity === null) {
      this.stateSignal.set({ kind: 'off' });
      return;
    }
    const owner: LedgerOwner = {
      device: identity.device,
      folder: identity.folder,
      epoch: identity.epoch,
    };
    this.lastOwner = owner;
    const { device } = identity;
    // A choice on screen stays there while a round looks again in the
    // background: the round says when it is no longer the question.
    if (this.stateSignal().kind !== 'synced' && this.stateSignal().kind !== 'ask') {
      this.stateSignal.set({ kind: 'syncing' });
    }
    // Once the swap starts, the server may serve another database, whatever
    // the round does next: the page loads again even if the round then fails,
    // and the writes held meanwhile never reach it (`WriteGate`). Marked
    // before the swap, which can fail halfway: the PC restarted but the
    // owner's session did not open again.
    let swapped = false;
    const shell: SyncShell = {
      swapIn: async () => {
        swapped = true;
        await platform.shell.swapIn();
      },
    };
    try {
      const key = await this.keyOf(identity.syncKey);
      const folder = await checkFolder(platform.remote, key, identity.folder);
      if (folder !== 'ours') {
        this.stateSignal.set({ kind: folder === 'another' ? 'another-folder' : 'unpaired' });
        return;
      }
      if (!(await hasRoomFor(platform.remote, device))) {
        this.stateSignal.set({ kind: 'full' });
        return;
      }
      let ledger = loadLedger(owner);
      if (ledger.base === null && !platform.publishesFirst) {
        const listing = await platform.remote.list('versions');
        if (versionsIn(listing.files).length === 0) {
          this.stateSignal.set({ kind: 'waiting-first' });
          return;
        }
      }
      const context: SyncContext = {
        device,
        app: appVersionOf(VERSION.tag),
        key,
        remote: platform.remote,
        server: this.server,
        shell,
        ledger,
        saveLedger: (next: SyncLedger) => {
          ledger = next;
          saveLedger(owner, next);
        },
        holdWrites: (work) => this.gate.hold(work, () => swapped),
        now: () => Date.now(),
      };
      const { outcome } =
        resolution === undefined
          ? await syncOnce(context)
          : await resolveAsk(context, resolution.choice, resolution.seen);
      await this.countToDecide();
      if (resolution !== undefined && outcome.kind === 'nothing') {
        // The folder emptied before the owner confirmed: nothing was chosen,
        // and the round after says what to do now.
        this.again = true;
      }
      switch (outcome.kind) {
        case 'pulled':
        case 'rebased':
          // The page holds what it read from the database it had.
          this.reload();
          return;
        case 'ask':
          this.stateSignal.set({
            kind: 'ask',
            latest: outcome.latest,
            mine: outcome.latest.device === device,
          });
          return;
        case 'wait': {
          // Its push is not listed yet: what it carried is not on Drive for
          // sure, so it still counts as to send.
          const count = await this.pending(owner);
          this.stateSignal.set(
            count > 0 ? { kind: 'pending', count, offline: false } : { kind: 'syncing' },
          );
          this.schedule(WAIT_RETRY_MS);
          return;
        }
        case 'retry':
          this.again = true;
          return;
        default:
          this.stateSignal.set({ kind: 'synced', at: Date.now() });
      }
    } catch (error) {
      await this.failed(error, owner);
      if (swapped) {
        this.reload();
      }
    }
  }

  /** The conflicts that wait, counted again: after a round, and after the owner answers one. */
  async countToDecide(): Promise<void> {
    try {
      this.toDecideSignal.set((await this.server.conflicts()).length);
    } catch {
      // The count waits for the next round: the pill never fails on it.
    }
  }

  private async failed(error: unknown, owner: LedgerOwner | null): Promise<void> {
    if (error instanceof RemoteError && error.reason === 'unauthorized') {
      this.stateSignal.set({ kind: 'reconnect' });
      return;
    }
    const offline =
      (error instanceof RemoteError && error.reason === 'offline') ||
      (error instanceof HttpErrorResponse && error.status === 0);
    const count = owner === null ? 0 : await this.pending(owner);
    if (offline || count > 0) {
      this.stateSignal.set({ kind: 'pending', count, offline });
    } else {
      this.stateSignal.set({
        kind: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    // Back online, the `online` event brings it sooner.
    this.schedule(FAILURE_RETRY_MS);
  }

  /**
   * The writes in no version the folder lists yet: a push whose upload failed
   * halfway counts them as sent (`pushedThrough`) before Drive has them.
   * 0 when even that cannot be told.
   */
  private async pending(owner: LedgerOwner): Promise<number> {
    try {
      const listedThrough = loadLedger(owner).listedThrough;
      return (await this.server.journal()).filter(
        (entry) => listedThrough === null || entry.id > listedThrough,
      ).length;
    } catch {
      return 0;
    }
  }

  private async keyOf(raw: string): Promise<CryptoKey> {
    if (this.key?.raw !== raw) {
      this.key = {
        raw,
        key: await importSyncKey(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))),
      };
    }
    return this.key.key;
  }
}
