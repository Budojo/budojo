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

/**
 * The exact shape `backupArchiveName` produces — and the only thing this module
 * will ever act on.
 *
 * Recognising by prefix and suffix alone, as this did until #1330, is not a
 * loose check but a wrong one. The backup folder belongs to the owner, and
 * `budojo-backup-keep-1.zip` is a name a person plausibly types: it would be
 * treated as ours and proposed for deletion. Worse, any non-numeric third
 * segment sorts *after* every `YYYYMMDD`, so a handful of such files occupy the
 * whole recent tier and push the real archives out of it — silently restoring
 * the shallow history #1330 exists to fix, and with `keepDays: 0` deleting the
 * genuinely newest archive.
 *
 * So the recogniser is strict, and the generator is pinned to it by a test.
 */
const ARCHIVE_PATTERN = /^budojo-backup-(\d{8})-\d{6}\.zip$/;

export function isBackupArchive(name: string): boolean {
  return ARCHIVE_PATTERN.test(name);
}

/**
 * How much history to hold, in two tiers (#1330).
 *
 * A flat count cannot express what a backup is actually for. The task runs
 * every six hours, so seven archives — what shipped until now — is 42 hours:
 * plenty for "I have just broken something", and nothing at all for "this went
 * wrong some time last week", which is the case nobody catches immediately and
 * therefore the case that matters. Buying depth by raising the count buys it in
 * the most expensive possible currency, six-hourly archives of a tree that
 * contains every encrypted document.
 *
 * So: keep the recent ones densely, and keep one per day going back. The two
 * questions get one answer each, and the disk pays for neither twice.
 */
export interface RetentionPolicy {
  /** Newest archives always kept, whatever day they fall on. Never below 1. */
  keepRecent: number;
  /** Most recent days *present* that each keep their last archive. */
  keepDays: number;
}

/**
 * A fortnight of history for ~18 archives.
 *
 * `keepRecent: 6` is 36 hours of six-hourly cover; `keepDays: 14` is the
 * fortnight behind it. Raise `keepDays` for more depth — it costs one archive
 * per day, against `keepRecent`'s four.
 */
export const RETENTION: RetentionPolicy = { keepRecent: 6, keepDays: 14 };

/** `budojo-backup-YYYYMMDD-HHMMSS.zip` → `YYYYMMDD`. Never null for a name that
 * passed `isBackupArchive`, which is the only way one reaches here. */
function archiveDay(name: string): string | null {
  return ARCHIVE_PATTERN.exec(name)?.[1] ?? null;
}

/**
 * Which archives to delete, oldest first.
 *
 * Names sort by time, by construction, which is what lets every decision here
 * be a string comparison rather than a date parse.
 *
 * **The invariants matter more than the policy.** Whatever the policy says, and
 * however wrong a future caller gets it, this never proposes deleting the
 * newest archive and never proposes deleting a file it did not create. A
 * retention bug is the one bug in this module that destroys data rather than
 * merely refusing to help, so `keepRecent` is floored at 1 rather than trusted.
 */
export function planRetention(names: readonly string[], policy: RetentionPolicy): string[] {
  const archives = names.filter(isBackupArchive).sort();
  const keep = new Set(archives.slice(-Math.max(policy.keepRecent, 1)));

  if (policy.keepDays > 0) {
    // Sorted ascending, so the last write per day wins — the newest archive of
    // that day, which is the one worth holding.
    const lastPerDay = new Map<string, string>();

    for (const name of archives) {
      const day = archiveDay(name);

      // An unparsable name is never *protected* by this tier: a pile of
      // truncated names must not push real days out of the window. It can still
      // be held by `keepRecent`, which is the tier that guards against loss.
      if (day !== null) {
        lastPerDay.set(day, name);
      }
    }

    const days = [...lastPerDay.keys()].sort();

    for (const day of days.slice(Math.max(days.length - policy.keepDays, 0))) {
      keep.add(lastPerDay.get(day) as string);
    }
  }

  return archives.filter((name) => !keep.has(name));
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
  retention: RetentionPolicy;
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
    } catch (error) {
      // A run that dies before `prune()` leaves the directory one over the
      // policy, and the next run cannot get there either if what killed it was
      // a full disk. Pruning on the way out breaks that loop: it frees nothing
      // at steady state — retention is idempotent, there is nothing to reclaim
      // — but it does reclaim the excess a previous half-finished run left, and
      // that can be exactly the room the next attempt needs.
      //
      // Best-effort on purpose. The caller has to see the real failure, not a
      // second one raised while tidying up after it.
      await this.prune().catch(() => undefined);

      throw error;
    } finally {
      await io.removeDir(stagingDir);
    }
  }

  private async prune(): Promise<void> {
    const names = (await this.options.io.listArchives()).map((entry) => entry.name);

    for (const stale of planRetention(names, this.options.retention)) {
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
