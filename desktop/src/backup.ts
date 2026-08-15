/**
 * Local backup & restore (#1228, M11 #1218).
 *
 * Leaving managed infrastructure means leaving managed backups: the droplet had
 * snapshots, MySQL had dumps, Forge had release rollback. On a laptop, one
 * failed SSD takes out every athlete record, every attendance entry and every
 * medical certificate with no recovery path. This is the difference between a
 * personal tool and a liability, so it is the most carefully tested module
 * here.
 *
 * An archive is a zip of three things: the database (copied with SQLite's own
 * `VACUUM INTO`, never a file copy — a WAL-mode file copied from under a live
 * connection is subtly corrupt and only fails at restore time), the `storage/`
 * tree (the encrypted documents), and a manifest (app version, schema version,
 * timestamp). The pure decisions — archive naming, retention pruning, manifest
 * shape, and the restore-safety check — are here and unit-tested; the I/O is
 * injected so `BackupService` in main.ts wires it to php.exe and PowerShell,
 * and the harness exercises the real thing.
 */

export interface BackupManifest {
  /** Format version of this manifest, so a future change can be detected. */
  format: 1;
  appVersion: string;
  /** The newest applied migration name — a lexically sortable schema marker. */
  schemaVersion: string;
  createdAt: string;
}

export interface BackupEntry {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

const ARCHIVE_PREFIX = 'budojo-backup-';
const ARCHIVE_SUFFIX = '.zip';

/** `budojo-backup-YYYYMMDD-HHMMSS.zip` — sortable, unambiguous, one per second. */
export function backupArchiveName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `${ARCHIVE_PREFIX}${stamp}${ARCHIVE_SUFFIX}`;
}

export function isBackupArchive(name: string): boolean {
  return name.startsWith(ARCHIVE_PREFIX) && name.endsWith(ARCHIVE_SUFFIX);
}

/**
 * Which archives to delete to keep at most `keep`, oldest first. Sorted by name
 * — which is sorted by time, by construction — so the newest `keep` survive.
 * Never returns the newest, whatever `keep` is (a retention bug must not be
 * able to delete the only good backup).
 */
export function planRetention(names: readonly string[], keep: number): string[] {
  const archives = names.filter(isBackupArchive).sort();
  const excess = archives.length - Math.max(keep, 1);

  return excess > 0 ? archives.slice(0, excess) : [];
}

export function buildManifest(input: { appVersion: string; schemaVersion: string; now: Date }): BackupManifest {
  return {
    format: 1,
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion,
    createdAt: input.now.toISOString(),
  };
}

export type RestoreCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether an archive is safe to restore into the running app.
 *
 * The one refusal that matters: an archive whose schema is *newer* than the
 * running app's. That happens when a backup from a later installer is restored
 * onto an earlier one — its database would be ahead of the code, and the app
 * would run migrations it does not have or read columns it does not expect. A
 * missing or malformed manifest is refused for the same reason: unknown is not
 * safe. An *older* archive is fine — the boot migration brings it forward.
 */
export function checkRestore(manifest: Partial<BackupManifest> | null, currentSchemaVersion: string): RestoreCheck {
  if (manifest === null || manifest.format !== 1 || typeof manifest.schemaVersion !== 'string') {
    return { ok: false, reason: 'The archive has no readable manifest and cannot be trusted.' };
  }

  if (manifest.schemaVersion > currentSchemaVersion) {
    return {
      ok: false,
      reason:
        `This backup is from a newer version of Budojo (schema ${manifest.schemaVersion}) than the one ` +
        `installed (schema ${currentSchemaVersion}). Update Budojo, then restore.`,
    };
  }

  return { ok: true };
}

// --- orchestration -----------------------------------------------------------

/**
 * The filesystem + subprocess primitives the service needs, injected so the
 * pure orchestration below is testable and the real wiring lives in main.ts.
 */
export interface BackupIO {
  /** SQLite `VACUUM INTO` from the live DB to `destSqlite`, through php.exe. */
  vacuumInto: (destSqlite: string) => Promise<void>;
  /** Recursively copy `storage/` into `destDir/storage`. */
  copyStorage: (destDir: string) => Promise<void>;
  writeManifest: (destDir: string, manifest: BackupManifest) => Promise<void>;
  /** Zip `srcDir`'s contents into `archivePath`. */
  zipDir: (srcDir: string, archivePath: string) => Promise<void>;
  /** Extract `archivePath` into `destDir`. */
  unzip: (archivePath: string, destDir: string) => Promise<void>;
  readManifest: (dir: string) => Promise<Partial<BackupManifest> | null>;
  /** The newest applied migration name in the live database. */
  currentSchemaVersion: () => Promise<string>;
  makeTempDir: (kind: 'backup' | 'restore') => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  listArchives: () => Promise<BackupEntry[]>;
  removeArchive: (name: string) => Promise<void>;
  /** Replace the live database + storage with the extracted ones. Caller has stopped PHP. */
  swapIn: (extractedDir: string) => Promise<void>;
  archivePathFor: (name: string) => string;
}

export interface BackupServiceOptions {
  io: BackupIO;
  appVersion: string;
  retentionKeep: number;
  log: (line: string) => void;
  now?: () => Date;
}

export class BackupService {
  private readonly now: () => Date;

  constructor(private readonly options: BackupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Creates one archive, prunes to retention, returns the archive path. */
  async backup(): Promise<string> {
    const { io } = this.options;
    const stagingDir = await io.makeTempDir('backup');

    try {
      await io.vacuumInto(`${stagingDir}/budojo.sqlite`);
      await io.copyStorage(stagingDir);
      await io.writeManifest(
        stagingDir,
        buildManifest({
          appVersion: this.options.appVersion,
          schemaVersion: await io.currentSchemaVersion(),
          now: this.now(),
        }),
      );

      const archivePath = io.archivePathFor(backupArchiveName(this.now()));
      await io.zipDir(stagingDir, archivePath);
      this.options.log(`[backup] created ${archivePath}`);

      await this.prune();

      return archivePath;
    } finally {
      await io.removeDir(stagingDir);
    }
  }

  private async prune(): Promise<void> {
    const names = (await this.options.io.listArchives()).map((entry) => entry.name);

    for (const stale of planRetention(names, this.options.retentionKeep)) {
      await this.options.io.removeArchive(stale);
      this.options.log(`[backup] pruned ${stale}`);
    }
  }

  async list(): Promise<BackupEntry[]> {
    return (await this.options.io.listArchives()).sort((a, b) => b.name.localeCompare(a.name));
  }

  /**
   * Validates an archive and, only if safe, swaps it in. The caller stops the
   * PHP server before and restarts it after — the swap must not run against a
   * live connection. Returns the check so a refusal surfaces its reason.
   */
  async restore(archiveName: string): Promise<RestoreCheck> {
    const { io } = this.options;
    const extractDir = await io.makeTempDir('restore');

    try {
      await io.unzip(io.archivePathFor(archiveName), extractDir);
      const check = checkRestore(await io.readManifest(extractDir), await io.currentSchemaVersion());

      if (!check.ok) {
        this.options.log(`[restore] refused ${archiveName}: ${check.reason}`);

        return check;
      }

      await io.swapIn(extractDir);
      this.options.log(`[restore] restored ${archiveName}`);

      return check;
    } finally {
      await io.removeDir(extractDir);
    }
  }
}
