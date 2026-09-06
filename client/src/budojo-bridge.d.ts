interface BackupArchive {
  readonly name: string;
  readonly path: string;
  readonly createdAt: string;
  readonly sizeBytes: number;
}

/** An archive and where it currently exists (#1301). */
interface DriveArchive {
  readonly name: string;
  readonly sizeBytes: number;
  /** Null for an archive that only exists in the Google account. */
  readonly createdAt: string | null;
  readonly local: boolean;
  readonly remote: boolean;
  readonly remoteId: string | null;
}

/**
 * Where backups are copied, and how that last went (#1320).
 *
 * `lastCopyAt` and `lastErrorAt` are separate on purpose: "is it working now?"
 * and "how old is the newest copy over there?" are different questions, and the
 * second is the one that matters the day this disk dies.
 */
interface BackupFolderState {
  /** Absolute path, or null when the owner has not chosen one. */
  readonly folder: string | null;
  readonly lastCopyAt: string | null;
  readonly lastError: string | null;
  readonly lastErrorAt: string | null;
}

/**
 * The Drive link as the Backup page shows it (#1301).
 *
 * `lastSyncAt` and `lastErrorAt` are separate on purpose: they answer different
 * questions — "is it working now?" and "how old is the newest copy up there?" —
 * and the second is the one that matters the day the disk dies.
 */
interface DriveLinkState {
  /** False when the build ships no OAuth client, i.e. the feature is unavailable. */
  readonly configured: boolean;
  readonly linked: boolean;
  readonly account?: string | null;
  readonly lastSyncAt?: string | null;
  readonly lastError?: string | null;
  readonly lastErrorAt?: string | null;
  readonly consecutiveFailures?: number;
}

/**
 * A pending application update, as the top bar renders it (#1339).
 *
 * `ready` means the installer is already on disk and applies on the next quit
 * — it survives a later failed check, because going offline does not undo a
 * finished download.
 */
type UpdateStatus =
  | { readonly phase: 'idle' }
  /** A check is in flight — published so a "check now" press can say so (#1401). */
  | { readonly phase: 'checking' }
  /** The check finished and found nothing. Transient: the renderer decides how long it shows. */
  | { readonly phase: 'up-to-date' }
  | { readonly phase: 'downloading'; readonly version: string; readonly percent: number }
  | { readonly phase: 'ready'; readonly version: string };

/**
 * The renderer-side view of the Electron preload bridge (`desktop/src/preload.cts`).
 * Present only inside Budojo Desktop; every reader must tolerate `undefined`.
 */
interface BudojoBridge {
  /** `http://127.0.0.1:<port>` of the supervised API; `''` outside Electron. */
  readonly apiBase: string;
  /** Node's `process.platform` of the host. */
  readonly platform: string;
  /**
   * The running app version, painted in the desktop title bar (#1401).
   * A development run reports `0.0.0`, which is shown as-is: it says "not a
   * release" more clearly than a blank would.
   */
  version(): Promise<string>;
  /**
   * Subscribes to in-app navigation requests raised by the main process — a
   * clicked native toast (#1225). Paths only (`/dashboard/...`); the renderer
   * still owns routing. Returns the unsubscribe function.
   */
  onNavigate(callback: (path: string) => void): () => void;
  /**
   * Synchronous access to the Sanctum bearer token, held encrypted in the OS
   * keychain by the main process (#1227). Present only inside Budojo Desktop.
   */
  readonly token: {
    get(): string | null;
    set(token: string): void;
    clear(): void;
  };
  /** Local backup & restore (#1228). Present only inside Budojo Desktop. */
  readonly backup: {
    list(): Promise<BackupArchive[]>;
    run(): Promise<{ ok: boolean; path: string | null }>;
    restore(name: string): Promise<{ ok: boolean; reason?: string }>;
  };
  /**
   * Backup folder (#1320). The owner picks any folder — one their cloud client
   * already syncs, a NAS, a USB stick — and every backup is copied there. No
   * account, no API, no network code.
   */
  readonly folder: {
    state(): Promise<BackupFolderState>;
    /** Opens the native folder picker; false when the owner cancels. */
    choose(): Promise<{ ok: boolean; state?: BackupFolderState }>;
    clear(): Promise<{ ok: boolean }>;
    copy(): Promise<{ ran: boolean; copied?: number; error?: string; reason?: string }>;
    /** Reveals the chosen folder in the OS file manager. */
    open(): Promise<{ ok: boolean }>;
  };
  /**
   * Google Drive backup sync (#1301). Opt-in and off by default: an on-disk
   * backup does not survive the disk, and telling the owner to copy the archive
   * into a synced folder by hand was never a plan they would keep.
   *
   * `state()` answers even when the build carries no OAuth client — it returns
   * `configured: false` so the page can say the feature is unavailable rather
   * than offering a Connect button that opens a Google error page.
   *
   * The recovery code is deliberately NOT part of this: archive and keys in the
   * same Google account are one compromised login away from every medical
   * certificate being readable (#1254).
   */
  readonly drive: {
    state(): Promise<DriveLinkState>;
    /** Local and remote archives merged, so a fresh machine still sees the account's. */
    archives(): Promise<DriveArchive[]>;
    link(): Promise<{ ok: boolean; account?: string | null; error?: string }>;
    unlink(): Promise<{ ok: boolean }>;
    sync(): Promise<{
      ran: boolean;
      uploaded?: number;
      deleted?: number;
      error?: string;
      reason?: string;
    }>;
  };
  /**
   * Recovery-key export/import (#1254). `export` decrypts the OS-keychain key
   * store into a single copy-pasteable code; `import` writes a provided code's
   * keys back and relaunches the app under them. Present only inside Budojo
   * Desktop — the one way to move the document-decryption keys to a new machine.
   */
  readonly keys: {
    export(): Promise<{ ok: boolean; code?: string; reason?: string }>;
    import(code: string): Promise<{ ok: boolean; reason?: string }>;
  };
  /**
   * Auto-update progress (#1339). `status()` answers the current state for the
   * first paint; `onStatus` pushes every change after that and returns its own
   * unsubscribe, so a download starting while the window is open is visible
   * without polling for it.
   */
  readonly update: {
    status(): Promise<UpdateStatus>;
    /**
     * Check now instead of waiting for the six-hourly poll (#1401).
     *
     * The **outcome** arrives through `onStatus`, exactly as it does for the
     * automatic check — this resolves only with whether a check could be
     * started. `{ ok: false, reason: 'unavailable' }` means there is no updater
     * at all (development, unpackaged, or version `0.0.0`), which is
     * a permanent condition worth saying out loud rather than spinning against.
     */
    check(): Promise<{ ok: boolean; reason?: 'unavailable' | 'failed' }>;
    onStatus(callback: (status: UpdateStatus) => void): () => void;
    /**
     * Quit, run the installer visibly, and come back (#1362).
     *
     * Only meaningful while the status is `ready`. Resolves `{ ok: false }`
     * when there is nothing downloaded to install, rather than quitting the
     * app on a stale click.
     */
    installNow(): Promise<{ ok: boolean }>;
  };
}

interface Window {
  readonly __BUDOJO__?: BudojoBridge;
}
