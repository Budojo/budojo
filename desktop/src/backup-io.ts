import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BackupEntry, BackupIO, BackupManifest } from './backup.js';
import { isBackupArchive } from './backup.js';
import { runPhp } from './php-exec.js';

/**
 * The real filesystem + subprocess backing for BackupService (#1228).
 *
 * VACUUM INTO goes through the bundled php.exe (SQLite's online backup, correct
 * under WAL where a file copy is not). Zip/unzip use PowerShell's
 * Compress-Archive / Expand-Archive — the same Windows-only toolchain as the
 * PHP-runtime fetch, no zip dependency added. The database and storage swap on
 * restore is a plain move, done while the caller holds the PHP server stopped.
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
      // Zip the *contents* of srcDir (the trailing \* ) so the archive has
      // budojo.sqlite / storage / manifest.json at its root, not a wrapper dir.
      run(`Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${archivePath}' -Force`);
      if (!existsSync(archivePath)) {
        throw new Error(`Compress-Archive produced no file at ${archivePath}`);
      }
    },

    unzip: async (archivePath, destDir) => {
      run(`Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`);
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

function run(command: string): void {
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`powershell failed (${result.status ?? 'null'}): ${result.stderr?.trim() ?? ''}`);
  }
}
