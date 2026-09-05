import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BackupEntry, BackupIO, BackupManifest } from './backup.js';
import { isBackupArchive } from './backup.js';
import { runPhp } from './php-exec.js';

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

    swapIn: async (extractedDir) => {
      const restoredDb = path.join(extractedDir, 'budojo.sqlite');
      const restoredStorage = path.join(extractedDir, 'storage');

      if (!existsSync(restoredDb)) {
        throw new Error('the archive contains no budojo.sqlite');
      }

      // Drop the WAL/SHM siblings of the live DB first — a stale -wal against a
      // freshly swapped database is corruption. The server is stopped, so
      // nothing holds them.
      for (const sibling of ['', '-wal', '-shm', '-journal']) {
        rmSync(config.databasePath + sibling, { force: true });
      }
      cpSync(restoredDb, config.databasePath);

      if (existsSync(restoredStorage)) {
        rmSync(config.storageDir, { recursive: true, force: true });
        cpSync(restoredStorage, config.storageDir, { recursive: true });
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
