import { constants, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BackupEntry, BackupIO, BackupManifest } from './backup.js';
import { isBackupArchive } from './backup.js';
import { retryWhileBusy } from './fs-retry.js';
import { runPhp } from './php-exec.js';

/** About a second in all: long enough for a scan to let go, short enough not to feel hung. */
const RENAME_RETRY = { attempts: 10, delayMs: 100 };

/**
 * Removing what a scanner may still hold: Node retries `EBUSY` / `EPERM`,
 * sleeping `attempt × retryDelay` between tries — about 2 s per call on
 * Windows (100 + 200 + … ms), and the sleep blocks the main process, so a
 * window can freeze for a few seconds when two removals are both held. Linux
 * rounds that sleep to nothing, which is why no harness there shows it.
 * Acceptable because nothing waits unless a file is held, which is the
 * failure path this exists for; a restore with nothing in the way removes on
 * the first try. Only honoured with `recursive`, which a plain file accepts
 * too.
 */
const REMOVE_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;

/**
 * The real filesystem + subprocess backing for BackupService (#1228).
 *
 * VACUUM INTO goes through the bundled PHP (SQLite's online backup, correct
 * under WAL where a file copy is not), and so do zip/unzip via `ZipArchive`
 * (#1300) — they used to shell out to PowerShell's Compress-Archive /
 * Expand-Archive, which is one of the four things that stopped the app from
 * running anywhere but Windows. Going back through the runtime rather than
 * adding a JS zip library keeps the desktop package at its single production
 * dependency, and matches how `vacuumInto` already works.
 *
 * The database and storage swap on restore is a plain move, done while the
 * caller holds the PHP server stopped.
 */
export interface BackupIOConfig {
  phpBinary: string;
  iniPath: string;
  serverRoot: string;
  env: Record<string, string>;
  databasePath: string;
  storageDir: string;
  backupsDir: string;
}

export function createBackupIO(config: BackupIOConfig): BackupIO {
  const php = (args: string[]): ReturnType<typeof runPhp> =>
    runPhp({ phpBinary: config.phpBinary, iniPath: config.iniPath, args, cwd: config.serverRoot, env: config.env, timeoutMs: 120_000 });

  return {
    vacuumInto: async (destSqlite) => {
      const result = await php([
        '-r',
        '$p = new PDO("sqlite:" . $argv[1]); $p->exec("VACUUM INTO " . $p->quote($argv[2]));',
        '--',
        config.databasePath,
        destSqlite,
      ]);

      if (result.code !== 0 || !existsSync(destSqlite)) {
        throw new Error(`VACUUM INTO failed (exit ${result.code ?? 'null'}): ${result.output.trim()}`);
      }
    },

    copyStorage: async (destDir) => {
      if (existsSync(config.storageDir)) {
        cpSync(config.storageDir, path.join(destDir, 'storage'), { recursive: true });
      }
    },

    writeManifest: async (destDir, manifest) => {
      writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    },

    readManifest: async (dir) => {
      const file = path.join(dir, 'manifest.json');
      if (!existsSync(file)) {
        return null;
      }
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as Partial<BackupManifest>;
      } catch {
        return null;
      }
    },

    zipDir: async (srcDir, archivePath) => {
      const result = await php(['-r', ZIP_DIR, '--', srcDir, archivePath]);

      if (result.code !== 0 || !existsSync(archivePath)) {
        throw new Error(`zip failed (exit ${result.code ?? 'null'}): ${result.output.trim()}`);
      }
    },

    unzip: async (archivePath, destDir) => {
      const result = await php(['-r', UNZIP, '--', archivePath, destDir]);

      if (result.code !== 0) {
        throw new Error(`unzip failed (exit ${result.code ?? 'null'}): ${result.output.trim()}`);
      }
    },

    currentSchemaVersion: async () => {
      const result = await php([
        '-r',
        '$p = new PDO("sqlite:" . $argv[1]); ' +
          'try { $s = $p->query("select migration from migrations order by migration desc limit 1")->fetchColumn(); echo $s === false ? "" : $s; } catch (Throwable $e) { echo ""; }',
        '--',
        config.databasePath,
      ]);

      return result.output.trim();
    },

    makeTempDir: async (kind) => mkdtempSync(path.join(os.tmpdir(), `budojo-${kind}-`)),

    removeDir: async (dir) => rmSync(dir, { recursive: true, force: true }),

    listArchives: async (): Promise<BackupEntry[]> => {
      if (!existsSync(config.backupsDir)) {
        return [];
      }

      return readdirSync(config.backupsDir)
        .filter(isBackupArchive)
        .map((name) => {
          const full = path.join(config.backupsDir, name);
          const stats = statSync(full);

          return { name, path: full, createdAt: stats.mtime.toISOString(), sizeBytes: stats.size };
        });
    },

    removeArchive: async (name) => rmSync(path.join(config.backupsDir, name), { force: true }),

    archivePathFor: (name) => path.join(config.backupsDir, name),

    copyIn: async (sourcePath, name) => {
      mkdirSync(config.backupsDir, { recursive: true });
      // Never over an existing file: a name already taken is an archive the
      // list holds, and the engine does not copy those.
      copyFileSync(sourcePath, path.join(config.backupsDir, name), constants.COPYFILE_EXCL);
    },

    hasDatabase: async (extractedDir) => existsSync(path.join(extractedDir, 'budojo.sqlite')),

    swapIn: async (extractedDir) => {
      const restoredDb = path.join(extractedDir, 'budojo.sqlite');
      const restoredStorage = path.join(extractedDir, 'storage');

      if (!existsSync(restoredDb)) {
        throw new Error('the archive contains no budojo.sqlite');
      }

      // Copy everything in beside the live files first, and only then swap by
      // renaming (#1909). This used to delete the live database and then copy
      // the archived one over it, so a copy that failed half-way — a full disk
      // is enough — left no database at all. Every step that can fail for lack
      // of room happens here, while the live data is untouched; what follows
      // is renames on one volume.
      const stagedDb = `${config.databasePath}.restoring`;
      const stagedStorage = `${config.storageDir}.restoring`;
      const hasStorage = existsSync(restoredStorage);
      const previousDb = `${config.databasePath}.previous`;
      const previousStorage = `${config.storageDir}.previous`;
      const siblings = ['', '-wal', '-shm', '-journal'];

      // A `.previous` already here is what an earlier restore could not put
      // back — possibly the owner's newest data, newer than any backup. Never
      // deleted: set aside under the moment it was found, and left alone.
      //
      // Before anything is staged (#1919): the next boot reads a staged
      // `storage` beside a `.previous` database, with no staged database, as
      // this swap's database having gone in. An older `.previous` still here
      // while copying would let a copy cut short be read that way.
      const keptAt = new Date().toISOString().replace(/[:.]/g, '-');
      for (const leftover of [...siblings.map((sibling) => previousDb + sibling), previousStorage]) {
        if (existsSync(leftover)) {
          await retryWhileBusy(() => renameSync(leftover, `${leftover}.kept-${keptAt}`), RENAME_RETRY);
        }
      }

      // The staged storage is cleared whether or not this archive has one,
      // and always before the staged database: a staged storage with no staged
      // database is what the boot reads as "the database went in" (#1919). A
      // storage that will not go stops here, so the database is never removed
      // without it.
      const clearStaged = (): void => {
        rmSync(stagedStorage, REMOVE_RETRY);
        rmSync(stagedDb, REMOVE_RETRY);
      };
      // On the way out of a failure, the cleanup is best-effort and must never
      // become the error (#1959). The error is what tells the owner what
      // happened — after a failed undo, where their data is — and an `EBUSY`
      // on a staged copy would say nothing of the kind. What it leaves is a
      // staged copy the next restore clears before it starts.
      const clearStagedAfterFailure = (): void => {
        try {
          clearStaged();
        } catch {
          // Left for the next restore.
        }
      };
      try {
        clearStaged();
        cpSync(restoredDb, stagedDb);
        if (hasStorage) {
          cpSync(restoredStorage, stagedStorage, { recursive: true });
        }
      } catch (error) {
        clearStagedAfterFailure();
        throw error;
      }

      // The swap is renames, each one undone if a later one fails. Replacing
      // the database outright and then failing on `storage` — a directory
      // Windows will not rename while the antivirus holds a file in it —
      // left the archive's database with the old documents or none, and no
      // old database to go back to. So the live files step aside first, as
      // `.previous`, and go only once everything is in place.

      const moved: Array<[from: string, to: string]> = [];
      const move = async (from: string, to: string): Promise<void> => {
        await retryWhileBusy(() => renameSync(from, to), RENAME_RETRY);
        moved.push([from, to]);
      };

      try {
        // The live database with its WAL and SHM: a -wal can hold writes the
        // main file does not have yet, so it travels with it — and a stale
        // one left against the restored database would be corruption.
        for (const sibling of siblings) {
          if (existsSync(config.databasePath + sibling)) {
            await move(config.databasePath + sibling, previousDb + sibling);
          }
        }
        await move(stagedDb, config.databasePath);

        if (hasStorage) {
          if (existsSync(config.storageDir)) {
            await move(config.storageDir, previousStorage);
          }
          await move(stagedStorage, config.storageDir);
        }
      } catch (error) {
        // Put back what moved, newest first. What cannot be put back stays
        // under `.previous`, and the error says so: never deleted.
        const stuck: string[] = [];
        for (const [from, to] of moved.reverse()) {
          await retryWhileBusy(() => renameSync(to, from), RENAME_RETRY).catch(() => stuck.push(to));
        }
        clearStagedAfterFailure();

        if (stuck.length > 0) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}; could not put back ${stuck.join(', ')}`,
          );
        }
        throw error;
      }

      // Done: the old generation can go. Best-effort — the restore has already
      // happened, and a scanner still holding a file in `storage.previous` must
      // not turn it into a reported failure. What stays is set aside, not
      // deleted, by the next restore.
      for (const leftover of [...siblings.map((sibling) => previousDb + sibling), previousStorage]) {
        try {
          rmSync(leftover, REMOVE_RETRY);
        } catch {
          // Left for the next restore to set aside.
        }
      }
    },
  };
}

/**
 * Zips the *contents* of a directory, so the archive carries budojo.sqlite /
 * storage / manifest.json at its root rather than a wrapper directory.
 *
 * Entry names are forced to forward slashes. That is the whole reason an
 * archive taken on one machine restores on the other: the zip format specifies
 * `/` as the separator, and building names from `DIRECTORY_SEPARATOR` would
 * write backslashes on Windows that Linux then reads as part of the filename.
 */
const ZIP_DIR = `
$src = rtrim($argv[1], '/\\\\');
$zip = new ZipArchive();
if ($zip->open($argv[2], ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
  fwrite(STDERR, 'could not open archive for writing');
  exit(1);
}
$items = new RecursiveIteratorIterator(
  new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS),
  RecursiveIteratorIterator::SELF_FIRST
);
foreach ($items as $item) {
  $rel = str_replace('\\\\', '/', substr($item->getPathname(), strlen($src) + 1));
  $ok = $item->isDir() ? $zip->addEmptyDir($rel) : $zip->addFile($item->getPathname(), $rel);
  if ($ok !== true) {
    fwrite(STDERR, 'could not add ' . $rel);
    exit(1);
  }
}
if ($zip->close() !== true) {
  fwrite(STDERR, 'could not finalise archive');
  exit(1);
}
`.trim();

/**
 * Extracts an archive over a destination directory.
 *
 * `extractTo` refuses entries that escape the destination, which matters here
 * because the archive is a file the user hands us — it may be corrupt, or from
 * somewhere else entirely. The harness asserts that refusal rather than taking
 * the documentation's word for it.
 */
const UNZIP = `
$zip = new ZipArchive();
if ($zip->open($argv[1]) !== true) {
  fwrite(STDERR, 'could not open archive for reading');
  exit(1);
}
if ($zip->extractTo($argv[2]) !== true) {
  fwrite(STDERR, 'could not extract archive');
  exit(1);
}
$zip->close();
`.trim();
