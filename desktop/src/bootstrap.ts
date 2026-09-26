import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { retryWhileBusy } from './fs-retry.js';
import { runPhp as execPhp } from './php-exec.js';

/**
 * First-run bootstrap (#1223, M11 #1218): everything Forge used to do at deploy
 * time — secrets, database, migrations — done automatically, once, idempotently,
 * without a `.env` on disk.
 *
 * The pure pieces (layout, secret generation, the migrate/snapshot decision) are
 * unit-tested; `runBootstrap` is the only place that touches the filesystem or
 * spawns PHP, and it is exercised against the real runtime in a harness.
 */

// --- layout ------------------------------------------------------------------

export interface DataLayout {
  root: string;
  databasePath: string;
  /** Laravel's storage/, relocated out of the read-only install dir. */
  storageDir: string;
  logsDir: string;
  backupsDir: string;
  tempDir: string;
  /** safeStorage-encrypted APP_KEY + DOCUMENT_ENCRYPTION_KEY. */
  secretsFile: string;
  /** Bootstrap bookkeeping: first run, last migration, app version. */
  stateFile: string;
  iniPath: string;
  pidFile: string;
  /** Which notification rows have already been shown as native toasts (#1225). */
  notificationsLedgerFile: string;
  /** The safeStorage-encrypted sign-in token (#1227). */
  authTokenFile: string;
  /**
   * The safeStorage-encrypted Google refresh token for backup sync (#1301).
   * Separate from authTokenFile so disconnecting Drive cannot disturb sign-in,
   * and separate from secrets.bin so it is never inside a backup archive.
   */
  driveTokenFile: string;
  /** Drive link bookkeeping — account, folder, last sync. Holds no secret. */
  driveStateFile: string;
  /** Which folder backups are copied into, and how that last went (#1320). */
  backupFolderStateFile: string;
  /**
   * Which theme was on screen when the app last closed (#1793).
   *
   * The main process cannot read the renderer's localStorage, and the window's
   * `backgroundColor` and native title-bar overlay are chosen *before* any
   * renderer exists — so without a remembered answer every launch on a dark
   * theme starts with a white flash. Holds no secret and is never restored
   * from a backup: it describes this machine's screen, not the owner's data.
   */
  themeFile: string;
}

/**
 * Everything that persists lives under userData — never beside the executable,
 * which is Program Files and read-only. One tree, so backup (#1228) and the
 * recovery runbook (#1232) have exactly one directory to talk about.
 */
export function dataLayout(userDataDir: string): DataLayout {
  const root = path.resolve(userDataDir);

  return {
    root,
    databasePath: path.join(root, 'budojo.sqlite'),
    storageDir: path.join(root, 'storage'),
    logsDir: path.join(root, 'logs'),
    backupsDir: path.join(root, 'backups'),
    tempDir: path.join(root, 'tmp'),
    secretsFile: path.join(root, 'secrets.bin'),
    stateFile: path.join(root, 'bootstrap.json'),
    iniPath: path.join(root, 'php.ini'),
    pidFile: path.join(root, 'php-server.pid'),
    notificationsLedgerFile: path.join(root, 'notifications-ledger.json'),
    authTokenFile: path.join(root, 'auth-token.bin'),
    driveTokenFile: path.join(root, 'drive-token.bin'),
    driveStateFile: path.join(root, 'drive-sync.json'),
    backupFolderStateFile: path.join(root, 'backup-folder.json'),
    themeFile: path.join(root, 'theme.json'),
  };
}

/**
 * The subtree Laravel expects under storage/. It does not create these itself:
 * a missing framework/views is "file_put_contents(): Failed to open stream" on
 * the first rendered mail, a missing framework/sessions the same on the first
 * request. Created up front, every launch, harmlessly.
 */
export function storageSubdirs(storageDir: string): string[] {
  return [
    path.join(storageDir, 'app'),
    path.join(storageDir, 'app', 'private'),
    path.join(storageDir, 'app', 'public'),
    path.join(storageDir, 'framework', 'cache', 'data'),
    path.join(storageDir, 'framework', 'sessions'),
    path.join(storageDir, 'framework', 'views'),
    path.join(storageDir, 'logs'),
  ];
}

// --- secrets -----------------------------------------------------------------

export interface Secrets {
  APP_KEY: string;
  DOCUMENT_ENCRYPTION_KEY: string;
}

const SECRETS_VERSION = 1;

/**
 * Both keys are 32 random bytes, base64. APP_KEY carries Laravel's `base64:`
 * prefix; DOCUMENT_ENCRYPTION_KEY is the raw base64 `config/documents.php`
 * expects. Separate keys on purpose (#224): the document key can be rotated
 * without invalidating every session token and encrypted column in the app.
 */
export function generateSecrets(randomBytes: (n: number) => Buffer = nodeRandomBytes): Secrets {
  return {
    APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
    DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
}

export function serializeSecrets(secrets: Secrets): string {
  return JSON.stringify({ v: SECRETS_VERSION, ...secrets });
}

/** Strict on shape: a half-written or foreign file must fail loudly, not yield empty keys. */
export function parseSecrets(serialized: string): Secrets {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('secrets file is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('secrets file has an unexpected shape');
  }

  const record = parsed as Record<string, unknown>;

  if (record['v'] !== SECRETS_VERSION) {
    throw new Error(`secrets file version ${String(record['v'])} is not supported`);
  }

  const appKey = record['APP_KEY'];
  const documentKey = record['DOCUMENT_ENCRYPTION_KEY'];

  if (typeof appKey !== 'string' || !appKey.startsWith('base64:') || appKey.length < 40) {
    throw new Error('secrets file has an invalid APP_KEY');
  }

  if (typeof documentKey !== 'string' || documentKey.length < 40) {
    throw new Error('secrets file has an invalid DOCUMENT_ENCRYPTION_KEY');
  }

  return { APP_KEY: appKey, DOCUMENT_ENCRYPTION_KEY: documentKey };
}

// --- migration decision ------------------------------------------------------

export interface MigrationPlan {
  /** Run `migrate --force` at all. */
  migrate: boolean;
  /** Take a VACUUM INTO snapshot first, because there is data to lose. */
  snapshot: boolean;
}

/**
 * `migrate:status --pending=1` exits 0 when nothing is pending, 1 when
 * something is (or when the migrations table does not exist yet). The rule:
 * an empty database is migrated straight away; a database with anything in it
 * is snapshotted before any migration touches it — an interrupted upgrade must
 * never be the reason a year of attendance is gone.
 */
export function planMigration(input: { databaseBytes: number; pendingExitCode: number | null }): MigrationPlan {
  if (input.databaseBytes === 0) {
    return { migrate: true, snapshot: false };
  }

  if (input.pendingExitCode === 0) {
    return { migrate: false, snapshot: false };
  }

  return { migrate: true, snapshot: true };
}

// --- an interrupted restore --------------------------------------------------

export type RecoveryStep = { kind: 'rename'; from: string; to: string } | { kind: 'remove'; path: string };

export interface RecoveryPlan {
  /**
   * `rolled-back` — the swap stopped before the restored database came in, so
   * the owner's own is put back. `rolled-forward` — the restored database was
   * already in and only `storage` was left, so the swap is finished.
   */
  situation: 'none' | 'rolled-back' | 'rolled-forward';
  steps: RecoveryStep[];
}

/** What steps aside with the database: a -wal can hold writes the main file does not have yet. */
const DATABASE_SIDECARS = ['-wal', '-shm', '-journal'];

/**
 * What a restore interrupted mid-swap left behind, and how to put it back
 * together (#1919).
 *
 * The swap (#1909) is renames: the live database and its siblings step aside
 * as `.previous`, the staged `.restoring` copy is renamed in, then `storage`
 * does the same. A crash between two renames used to leave no `budojo.sqlite`
 * at all — and the next boot ran first-run setup on an empty one, while the
 * owner's data, possibly newer than any backup, sat beside it unnoticed.
 *
 * - **No database, a `.previous` one:** the crash came before the restored
 *   database was in. Everything that stepped aside is put back, and the staged
 *   copies go: the restore never finished, and the archive it came from is
 *   still there. **The database itself comes back last.** Its absence is the
 *   only sign of an interrupted swap, so every step before it can stop — a
 *   rename that fails, a second power cut — and the next boot still sees the
 *   crash and finishes the job. Put back first, a `-wal` left under
 *   `.previous` would be forgotten, and the writes it holds with it.
 * - **A database, a `.previous` one, a staged `storage` but no staged
 *   database:** the restored database was in and `storage` was not. The staged
 *   storage is complete — every copy is made before the first rename — so the
 *   swap is finished rather than undone. That reading holds because `swapIn`
 *   sets any older `.previous` aside before it copies anything, and removes
 *   the staged storage before the staged database: a staged storage beside a
 *   `.previous` database, with no staged database, can only be this swap's.
 * - **Anything else is left alone.** A `.previous` beside a database is what a
 *   finished restore could not tidy, and the next restore sets it aside; a
 *   staged database still there means the crash came while copying, and a copy
 *   that may be cut short is never rolled forward.
 *
 * Whatever the files, the plan only ever renames onto a free name and removes
 * nothing but a staged `.restoring` copy: the owner's data is never deleted,
 * and never overwritten. `exists` is injected so the decision is testable
 * against every combination of files.
 */
export function planRecovery(
  layout: Pick<DataLayout, 'databasePath' | 'storageDir'>,
  exists: (file: string) => boolean,
): RecoveryPlan {
  const db = layout.databasePath;
  const storage = layout.storageDir;
  const stagedDb = `${db}.restoring`;
  const stagedStorage = `${storage}.restoring`;
  const previousStorage = `${storage}.previous`;

  if (!exists(db)) {
    if (!exists(`${db}.previous`)) {
      return { situation: 'none', steps: [] };
    }

    const steps: RecoveryStep[] = [stagedStorage, stagedDb]
      .filter((staged) => exists(staged))
      .map((staged) => ({ kind: 'remove', path: staged }));
    for (const sidecar of DATABASE_SIDECARS) {
      if (exists(`${db}.previous${sidecar}`) && !exists(db + sidecar)) {
        steps.push({ kind: 'rename', from: `${db}.previous${sidecar}`, to: db + sidecar });
      }
    }
    if (exists(previousStorage) && !exists(storage)) {
      steps.push({ kind: 'rename', from: previousStorage, to: storage });
    }
    steps.push({ kind: 'rename', from: `${db}.previous`, to: db });

    return { situation: 'rolled-back', steps };
  }

  const databaseSwappedIn = exists(`${db}.previous`) && !exists(stagedDb);
  if (!databaseSwappedIn || !exists(stagedStorage)) {
    return { situation: 'none', steps: [] };
  }

  if (!exists(storage)) {
    return { situation: 'rolled-forward', steps: [{ kind: 'rename', from: stagedStorage, to: storage }] };
  }
  if (!exists(previousStorage)) {
    return {
      situation: 'rolled-forward',
      steps: [
        { kind: 'rename', from: storage, to: previousStorage },
        { kind: 'rename', from: stagedStorage, to: storage },
      ],
    };
  }

  return { situation: 'none', steps: [] };
}

/** `pre-migration-YYYYMMDD-HHMMSS.sqlite`, sortable and unambiguous. */
export function snapshotFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `pre-migration-${stamp}.sqlite`;
}

// --- state -------------------------------------------------------------------

export interface BootstrapState {
  firstRunAt: string;
  lastBootAt: string;
  lastMigrateAt: string | null;
  appVersion: string;
}

// --- runner ------------------------------------------------------------------

/** The subset of Electron's safeStorage the bootstrap needs; injected so the harness can run without Electron. */
export interface SecretStore {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface BootstrapOptions {
  layout: DataLayout;
  secretStore: SecretStore;
  phpBinary: string;
  serverRoot: string;
  iniContent: string;
  /** Environment for artisan runs, given the secrets. Same builder the server uses. */
  envFor: (secrets: Secrets) => Record<string, string>;
  appVersion: string;
  log: (line: string) => void;
  now?: () => Date;
  randomBytes?: (n: number) => Buffer;
}

export interface BootstrapResult {
  secrets: Secrets;
  firstRun: boolean;
  migrated: boolean;
  snapshotPath: string | null;
}

export async function runBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const { layout, log } = options;
  const now = options.now ?? (() => new Date());

  await mkdir(layout.root, { recursive: true });
  // First, before anything looks at the files: the directories below would
  // create an empty `storage/` over the one an interrupted restore set aside,
  // and an empty database would be first-run setup over the owner's (#1919).
  await recoverInterruptedRestore(layout, log);
  await Promise.all(
    [layout.logsDir, layout.backupsDir, layout.tempDir, ...storageSubdirs(layout.storageDir)].map((dir) =>
      mkdir(dir, { recursive: true }),
    ),
  );
  await writeFile(layout.iniPath, options.iniContent, 'utf8');

  const firstRun = !existsSync(layout.stateFile);
  const databaseBytes = existsSync(layout.databasePath) ? (await stat(layout.databasePath)).size : 0;

  // --- secrets ---------------------------------------------------------------
  let secrets: Secrets;

  if (existsSync(layout.secretsFile)) {
    if (!options.secretStore.isEncryptionAvailable()) {
      throw new Error(
        'The operating system keychain is unavailable, so the stored application keys cannot be read. ' +
          'Budojo cannot start without them.',
      );
    }
    secrets = parseSecrets(options.secretStore.decryptString(await readFile(layout.secretsFile)));
    log('[bootstrap] secrets loaded from the keychain-encrypted store');
  } else {
    if (databaseBytes > 0) {
      // The one scenario that must not proceed silently: data exists, keys do
      // not. Generating fresh keys here would make every encrypted document
      // permanently unreadable while the app carries on as if nothing happened.
      throw new Error(
        `A database exists at ${layout.databasePath} but its keys (${layout.secretsFile}) are missing. ` +
          'Restore secrets.bin from a backup, or move the database away to start fresh. ' +
          'Refusing to generate new keys over existing data.',
      );
    }
    if (!options.secretStore.isEncryptionAvailable()) {
      throw new Error(
        'The operating system keychain is unavailable, so application keys cannot be stored safely. ' +
          'Budojo will not write them to disk in the clear.',
      );
    }
    secrets = generateSecrets(options.randomBytes);
    const encrypted = options.secretStore.encryptString(serializeSecrets(secrets));
    await writeFile(layout.secretsFile, encrypted, { mode: 0o600 });
    log('[bootstrap] generated APP_KEY and DOCUMENT_ENCRYPTION_KEY into the keychain-encrypted store');
  }

  const env = options.envFor(secrets);

  // --- database + migrations -------------------------------------------------
  if (databaseBytes === 0) {
    await writeFile(layout.databasePath, '', { flag: 'a' });
  }

  const pending =
    databaseBytes === 0
      ? null
      : (await artisan(options, env, ['migrate:status', '--pending=1', '--no-ansi'])).code;

  const plan = planMigration({ databaseBytes, pendingExitCode: pending });
  let snapshotPath: string | null = null;

  if (plan.snapshot) {
    snapshotPath = path.join(layout.backupsDir, snapshotFileName(now()));
    await snapshotDatabase(options, env, layout.databasePath, snapshotPath);
    log(`[bootstrap] pre-migration snapshot written to ${snapshotPath}`);
  }

  if (plan.migrate) {
    const result = await artisan(options, env, ['migrate', '--force', '--no-interaction', '--no-ansi']);

    if (result.code !== 0) {
      throw new Error(
        `Database migration failed (exit ${result.code ?? 'null'}).` +
          (snapshotPath === null ? '' : ` The pre-migration snapshot is at ${snapshotPath}.`) +
          `\n\n${result.output.trim().split(/\r?\n/).slice(-15).join('\n')}`,
      );
    }
    log(`[bootstrap] migrations applied${firstRun ? ' (first run)' : ''}`);
  } else {
    log('[bootstrap] schema up to date');
  }

  // --- state -----------------------------------------------------------------
  const previous = firstRun ? null : await readState(layout.stateFile);
  const stamp = now().toISOString();
  const state: BootstrapState = {
    firstRunAt: previous?.firstRunAt ?? stamp,
    lastBootAt: stamp,
    lastMigrateAt: plan.migrate ? stamp : (previous?.lastMigrateAt ?? null),
    appVersion: options.appVersion,
  };
  await writeFile(layout.stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');

  return { secrets, firstRun, migrated: plan.migrate, snapshotPath };
}

/**
 * Carries out {@link planRecovery} on the real files. The renames retry while
 * the antivirus holds a file for a moment, as the swap's own do; a rename that
 * still fails stops the boot with the error, rather than carrying on into
 * first-run setup beside the owner's data — and the next boot, finding the
 * database still missing, picks up where this one stopped.
 *
 * A staged copy that cannot be removed does not stop it: the owner's data does
 * not depend on it, and the next restore clears it before staging its own.
 */
export async function recoverInterruptedRestore(
  layout: Pick<DataLayout, 'databasePath' | 'storageDir'>,
  log: (line: string) => void,
): Promise<RecoveryPlan> {
  const plan = planRecovery(layout, existsSync);
  if (plan.situation === 'none') {
    return plan;
  }

  log(
    plan.situation === 'rolled-back'
      ? '[bootstrap] a restore was interrupted before the restored database was in: putting the previous one back'
      : '[bootstrap] a restore was interrupted after the restored database was in: finishing the swap of storage',
  );
  for (const step of plan.steps) {
    if (step.kind === 'rename') {
      await retryWhileBusy(() => renameSync(step.from, step.to), RECOVERY_RETRY);
      log(`[bootstrap]   ${path.basename(step.from)} -> ${path.basename(step.to)}`);
    } else {
      try {
        rmSync(step.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        log(`[bootstrap]   removed ${path.basename(step.path)}`);
      } catch (error) {
        log(
          `[bootstrap]   could not remove ${path.basename(step.path)} (${error instanceof Error ? error.message : String(error)}); ` +
            'left for the next restore to clear',
        );
      }
    }
  }

  return plan;
}

const RECOVERY_RETRY = { attempts: 10, delayMs: 100 };

async function readState(file: string): Promise<BootstrapState | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as BootstrapState;
  } catch {
    return null;
  }
}

/**
 * SQLite's own online backup, through the bundled PHP — `VACUUM INTO` is
 * correct under WAL where a file copy is not: a copy taken while a -wal
 * sibling holds committed pages silently loses those pages.
 */
async function snapshotDatabase(
  options: BootstrapOptions,
  env: Record<string, string>,
  source: string,
  destination: string,
): Promise<void> {
  const script =
    '$pdo = new PDO("sqlite:" . $argv[1]); ' +
    '$pdo->exec("VACUUM INTO " . $pdo->quote($argv[2]));';

  const result = await runPhp(options, env, ['-r', script, '--', source, destination], options.serverRoot);

  if (result.code !== 0 || !existsSync(destination)) {
    throw new Error(`Pre-migration snapshot failed (exit ${result.code ?? 'null'}):\n${result.output.trim()}`);
  }
}

function artisan(
  options: BootstrapOptions,
  env: Record<string, string>,
  args: string[],
): Promise<{ code: number | null; output: string }> {
  return runPhp(options, env, ['artisan', ...args], options.serverRoot);
}

async function runPhp(
  options: BootstrapOptions,
  env: Record<string, string>,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; output: string }> {
  const result = await execPhp({
    phpBinary: options.phpBinary,
    iniPath: options.layout.iniPath,
    args,
    cwd,
    env,
    // Migrations on a large database can legitimately take a while; two
    // minutes is far beyond anything the current 54 need and still bounded.
    timeoutMs: 120_000,
  });

  if (result.timedOut) {
    throw new Error(`php ${args[0] ?? ''} ${args[1] ?? ''} timed out after 120s`);
  }

  for (const line of result.output.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      options.log(`[php] ${line}`);
    }
  }

  return { code: result.code, output: result.output };
}
