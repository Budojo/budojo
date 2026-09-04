import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol, safeStorage, shell } from 'electron';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dataLayout, parseSecrets, runBootstrap, serializeSecrets, type Secrets } from './bootstrap.js';
import { BackupService, RETENTION } from './backup.js';
import { createBackupIO } from './backup-io.js';
import { createFolderCopyIO } from './folder-copy-io.js';
import { FolderCopyService } from './folder-copy-service.js';
import { createDriveSyncIO, driveClientConfig, DriveSyncService } from './drive-wiring.js';
import { formatConsoleMessage, isWorthLogging, redactSecrets } from './renderer-log.js';
import { DesktopNotifier, EMPTY_LEDGER, parseListOutput, type DeliveryLedger, type PendingNotification } from './desktop-notifier.js';
import { buildPhpEnv, buildPhpIni, resolveDesktopPaths } from './php-runtime.js';
import { runPhp } from './php-exec.js';
import { PhpSupervisor } from './php-supervisor.js';
import { RotatingLog } from './rotating-log.js';
import { TokenVault } from './token-vault.js';
import { PeriodicTask } from './periodic-task.js';
import { contentTypeFor, resolveAppRequest } from './protocol.js';
import { decodeRecoveryCode, encodeRecoveryCode } from './recovery-keys.js';
import {
  idleUpdateStatus,
  onDownloadProgress,
  onUpdateAvailable,
  onUpdateDownloaded,
  onUpdateError,
  type UpdateStatus,
} from './update-status.js';
import { planUpdateCheck, updateFailureLine, updateReadyMessage } from './update-policy.js';
// electron-updater is CommonJS and, under ESM, exposes NOTHING as a named
// export — `import { autoUpdater }` is silently `undefined` (same class as the
// qrcode interop bug in `.claude/gotchas.md`). It must come through the default
// export. It is also a lazy getter that reads `app.getVersion()`, so it is
// resolved inside the function below rather than destructured here: touching it
// at import time runs before Electron is ready and crashes on startup.
import electronUpdater from 'electron-updater';

/**
 * Electron main process for Budojo Desktop (M11 #1218).
 *
 * Wiring only: scheme registration, window lifecycle, single-instance lock,
 * and the order of operations at boot — bootstrap, start the PHP runtime (#1222), then
 * open a window that knows its port. The logic lives in the modules imported
 * above, each unit-tested on its own; the first-run bootstrap (#1223) runs
 * before the server so no request ever meets a half-migrated schema.
 */

const DEV = process.env['ELECTRON_DEV'] === '1';
const DEV_URL = 'http://localhost:4200';

/** Origin the packaged renderer is served from. */
const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://bundle`;

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The Angular production build. `dist/` sits next to this file once compiled,
 * and electron-builder copies the SPA in beside it.
 */
const RENDERER_ROOT = path.join(here, 'renderer');

/**
 * Development and packaged builds must never share a data directory: a dev
 * run against the owner's real database is one typo away from a very bad
 * afternoon. The name also decides `app.getPath('userData')`, so it is set
 * before anything reads that path.
 */
app.setName(app.isPackaged ? 'Budojo' : 'Budojo-dev');
// Windows attributes toasts to an AppUserModelID; without one they show as
// "electron.app.Electron". Must match electron-builder's appId.
app.setAppUserModelId('it.budojo.desktop');

/**
 * MUST run before `app.whenReady()`. Registering the scheme as `standard`
 * gives the renderer a real origin — without it Angular's PathLocationStrategy
 * has no History API to work against and every deep link renders blank.
 * `secure` puts it on the same footing as https for CSP and storage, so the
 * window never needs `webSecurity: false`.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const resolution = resolveAppRequest(RENDERER_ROOT, pathname, request);

    if (resolution.kind === 'not-found') {
      // Reasons are distinguished in the body so a packaging bug
      // ('missing-shell') is not mistaken for a routing decision while
      // debugging. See protocol.ts for why an asset miss must stay a 404.
      return new Response(`Not found (${resolution.reason})`, {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const body = await readFile(resolution.path);

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'Content-Type': contentTypeFor(resolution.path) },
    });
  });
}

/**
 * Records what the window does wrong (#1317).
 *
 * Nothing did, before: no console handler, no load-failure handler, and the
 * menu is nulled so there is no DevTools accelerator either. A page that failed
 * to render was completely silent — the owner saw a blank area and the only way
 * anyone found out was if they mentioned it. On a local-first app with no
 * telemetry this file is the whole diagnostic story.
 *
 * Every line goes through `redactSecrets` first: the renderer holds the Sanctum
 * token and can be handed a recovery code, and this log ends up in support
 * bundles and screenshots.
 */
function attachRendererLogging(window: BrowserWindow): void {
  // Opened here rather than at startup, on purpose. The first version kept a
  // module-level `RotatingLog | null` opened in the ready handler — and the
  // open was silently never wired, so the variable stayed null, this function
  // returned immediately, and the whole feature was inert while type-checking
  // and every test stayed green. Owning the log where it is used removes the
  // half-wired state entirely: there is nothing left to forget.
  const log = new RotatingLog(path.join(dataLayout(app.getPath('userData')).logsDir, 'renderer.log'));
  log.open();

  const write = (line: string): void => log.write(`${new Date().toISOString()} ${line}`);

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    // Warnings and errors only — Angular at info/debug would bury the one line
    // that matters and rotate it out of the file.
    if (isWorthLogging(level)) {
      write(formatConsoleMessage({ level, message, line, sourceId }));
    }
  });

  // The failure that matches a blank page: a chunk or asset 404ing under
  // app://bundle. `errorCode -3` is ABORTED, which fires on ordinary navigation
  // and is not a fault.
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      write(`[load-failed] ${errorCode} ${errorDescription} ${redactSecrets(validatedURL)}`);
    }
  });

  // A broken preload takes out sign-in and every desktop-only surface at once,
  // and looks like an app that simply does not work.
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    write(`[preload-error] ${preloadPath}: ${redactSecrets(error.message)}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    write(`[renderer-gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });

  window.on('unresponsive', () => {
    // Distinguishes "hung" from "slow", which look identical from the outside.
    write('[unresponsive] the window stopped responding');
  });
}

function createWindow(apiBase: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // The page surface token (`--p-surface-50`), not a colour of our own. The
    // window paints this before the renderer draws, so any mismatch is a flash
    // of the wrong colour at every launch. It used to be a dark navy while the
    // app's theme is light — and because the page painted no background of its
    // own, that navy stayed visible *underneath* the light theme, which is why
    // the app looked like dark-text-on-dark. Fixed on both sides.
    backgroundColor: '#fafafa',
    title: 'Budojo',
    // Native window controls, our colours. `frame: false` would mean
    // reimplementing minimise / maximise / close, and with them snap layouts,
    // double-click-to-maximise and the accessibility behaviour Windows gives
    // for free — a custom title bar gets those subtly wrong. Hiding the frame
    // and painting the overlay keeps the real buttons and drops the chrome.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#fafafa',
      symbolColor: '#1c1c1e',
      height: 40,
    },
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      // The renderer runs untrusted-by-default: no Node, isolated context,
      // OS-level sandbox. Everything it may do crosses the narrow bridge in
      // preload.cts and nothing else.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // How the renderer learns where the API is: the port the supervised PHP
      // process actually bound, known only now.
      additionalArguments: [`--budojo-api-base=${apiBase}`],
    },
  });

  // Avoid the white flash before Angular paints.
  window.once('ready-to-show', () => window.show());

  // A link to an external site opens in the user's browser. Letting it open a
  // new Electron window would hand a remote page a renderer inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  // Same rule for in-place navigation: the window only ever shows our own
  // origin (or the dev server). Anything else is a bug or an attack.
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN);

    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // The root, not /index.html: the router owns the path, and "/index.html" is
  // not a route it knows. The protocol handler serves the shell for "/".
  attachRendererLogging(window);

  void window.loadURL(DEV ? DEV_URL : `${APP_ORIGIN}/`);

  return window;
}

/**
 * Boots the runtime: first-run bootstrap (#1223), then the supervised PHP
 * server (#1222); returns the API base URL. Every failure path ends in a
 * native error box with the log location — never a blank renderer.
 */
async function startRuntime(): Promise<{
  supervisor: PhpSupervisor;
  scheduler: PeriodicTask;
  notifierPoll: PeriodicTask;
  backupService: BackupService;
  backupPoll: PeriodicTask;
  folderCopy: FolderCopyService;
  /** null when the build carries no OAuth client, i.e. the feature is unavailable. */
  driveService: DriveSyncService | null;
  apiBase: string;
}> {
  const paths = resolveDesktopPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    devRoot: path.resolve(here, '..'),
  });

  if (!existsSync(paths.phpBinary)) {
    throw new Error(
      app.isPackaged
        ? `The bundled PHP runtime is missing (${paths.phpBinary}). The installation is damaged; reinstall Budojo.`
        : `PHP runtime not found at ${paths.phpBinary}.\nRun \`npm run fetch:php\` in desktop/ first.`,
    );
  }

  // Everything that persists lives under userData, never beside the
  // executable — Program Files is read-only.
  const layout = dataLayout(app.getPath('userData'));
  await mkdir(layout.logsDir, { recursive: true });

  const iniContent = buildPhpIni({
    extensionDir: paths.phpExtensionDir,
    errorLog: path.join(layout.logsDir, 'php-error.log'),
    tempDir: layout.tempDir,
  });

  // One env builder for artisan runs and the server, so bootstrap and runtime
  // can never disagree on a driver, a path or a key. The port is irrelevant to
  // artisan and unknown until the server binds.
  const envWith = (secrets: Secrets, port: number): Record<string, string> =>
    buildPhpEnv(
      {
        port,
        databasePath: layout.databasePath,
        storagePath: layout.storageDir,
        rendererOrigin: APP_ORIGIN,
        // Exported as PHPRC so the subprocesses Laravel's scheduler spawns
        // load the same ini we pass with `-c` — without it they load none.
        iniPath: layout.iniPath,
        extra: { ...secrets },
      },
      process.env,
    );

  // First-run bootstrap (#1223): data directory, keys in the OS keychain,
  // migrations. Runs before the server so a half-migrated schema is never
  // what the first request meets.
  const bootstrapLog = createWriteStream(path.join(layout.logsDir, 'bootstrap.log'), { flags: 'a' });
  let boot;

  try {
    boot = await runBootstrap({
      layout,
      secretStore: safeStorage,
      phpBinary: paths.phpBinary,
      serverRoot: paths.serverRoot,
      iniContent,
      envFor: (secrets) => envWith(secrets, 0),
      appVersion: app.getVersion(),
      log: (line) => bootstrapLog.write(`${new Date().toISOString()} ${line}\n`),
    });
  } finally {
    bootstrapLog.end();
  }

  const supervisor = new PhpSupervisor({
    phpBinary: paths.phpBinary,
    serverRoot: paths.serverRoot,
    iniPath: layout.iniPath,
    iniContent,
    logDir: layout.logsDir,
    pidFile: layout.pidFile,
    appLogPath: path.join(layout.storageDir, 'logs', 'laravel.log'),
    envForPort: (port) => envWith(boot.secrets, port),
    onFatal: (error, context) => {
      dialog.showErrorBox(
        'Budojo stopped working',
        `${error.message}\n\nLog: ${context.logPath}\n\n${context.recentOutput}`,
      );
      app.exit(1);
    },
  });

  const { port } = await supervisor.start();

  // The desktop's cron (#1226): `schedule:run` every minute while the app is
  // open, once shortly after boot. What each run does is decided server-side
  // by routes/console-desktop.php.
  const schedulerLog = new RotatingLog(path.join(layout.logsDir, 'scheduler.log'));
  schedulerLog.open();
  const scheduler = new PeriodicTask({
    run: () =>
      runPhp({
        phpBinary: paths.phpBinary,
        iniPath: layout.iniPath,
        args: ['artisan', 'schedule:run', '--no-ansi', '--no-interaction'],
        cwd: paths.serverRoot,
        env: envWith(boot.secrets, port),
        timeoutMs: 10 * 60_000,
      }),
    log: (line) => schedulerLog.write(`${new Date().toISOString()} ${line}`),
  });
  scheduler.start();

  // Native toasts (#1225): poll the owner's new in-app notifications every
  // thirty seconds and show each once; the ledger under userData survives
  // restarts. Delivery is the shell's state, content is the server's.
  const notifierLog = new RotatingLog(path.join(layout.logsDir, 'notifier.log'));
  notifierLog.open();
  const notifier = new DesktopNotifier({
    list: async (afterIso) => {
      const result = await runPhp({
        phpBinary: paths.phpBinary,
        iniPath: layout.iniPath,
        args: ['artisan', 'budojo:list-desktop-notifications', `--after=${afterIso}`, '--no-ansi'],
        cwd: paths.serverRoot,
        env: envWith(boot.secrets, port),
        timeoutMs: 60_000,
      });

      return result.code === 0 ? parseListOutput(result.output) : [];
    },
    show: showNativeNotification,
    ledger: {
      read: async () => readLedger(layout.notificationsLedgerFile),
      write: (ledger) => writeFile(layout.notificationsLedgerFile, JSON.stringify(ledger, null, 2), 'utf8'),
    },
    log: (line) => notifierLog.write(`${new Date().toISOString()} ${line}`),
  });
  const notifierPoll = new PeriodicTask({
    run: async () => {
      const shown = await notifier.poll();

      return { code: 0, output: shown > 0 ? `${shown} shown` : '', timedOut: false };
    },
    log: (line) => notifierLog.write(`${new Date().toISOString()} ${line}`),
    intervalMs: 30_000,
    initialDelayMs: 8_000,
  });
  notifierPoll.start();

  // Local backup (#1228) — the single most important safety net once managed
  // infrastructure is gone. VACUUM INTO + storage + manifest, zipped under
  // userData/backups, held to `RETENTION` (see backup.ts: a dense recent tier
  // plus one archive a day behind it, #1330). A scheduled pass every six hours
  // means any day the app is opened produces a recent archive; each run is a
  // quick vacuum of a single-user database.
  const backupLog = new RotatingLog(path.join(layout.logsDir, 'backup.log'));
  backupLog.open();
  const backupService = new BackupService({
    io: createBackupIO({
      phpBinary: paths.phpBinary,
      iniPath: layout.iniPath,
      serverRoot: paths.serverRoot,
      env: envWith(boot.secrets, port),
      databasePath: layout.databasePath,
      storageDir: layout.storageDir,
      backupsDir: layout.backupsDir,
    }),
    appVersion: app.getVersion(),
    retention: RETENTION,
    log: (line) => backupLog.write(`${new Date().toISOString()} ${line}`),
  });
  // Drive sync (#1301). Off unless the owner connected an account, and off
  // entirely when the build carries no OAuth client.
  const driveConfig = driveClientConfig();
  const driveService =
    driveConfig === null
      ? null
      : new DriveSyncService(
          createDriveSyncIO({
            config: driveConfig,
            layout,
            vault: new TokenVault(layout.driveTokenFile, safeStorage),
            backupService,
            openExternal: (url) => shell.openExternal(url),
            log: (line) => backupLog.write(`${new Date().toISOString()} ${line}`),
          }),
        );

  // Copy each backup into the folder the owner picked (#1320). Off until they
  // pick one.
  const folderCopy = new FolderCopyService(
    createFolderCopyIO({
      layout,
      backupService,
      log: (line) => backupLog.write(`${new Date().toISOString()} ${line}`),
    }),
    RETENTION,
  );

  const backupPoll = new PeriodicTask({
    run: async () => {
      await backupService.backup();

      // After the local archive exists, never before. copy() contains its own
      // failures; the catch is the belt to that braces.
      await folderCopy.copy().catch(() => undefined);

      // Upload AFTER the local archive exists, and never let a sync failure
      // fail the tick — the backup that matters already happened. sync()
      // swallows its own errors into the link state; this catch is the belt to
      // that braces.
      await driveService?.sync().catch(() => undefined);

      return { code: 0, output: '', timedOut: false };
    },
    log: (line) => backupLog.write(`${new Date().toISOString()} ${line}`),
    intervalMs: 6 * 60 * 60_000,
    initialDelayMs: 60_000,
  });
  backupPoll.start();

  return {
    supervisor,
    scheduler,
    notifierPoll,
    backupService,
    backupPoll,
    folderCopy,
    driveService,
    apiBase: `http://127.0.0.1:${port}`,
  };
}

async function readLedger(file: string): Promise<DeliveryLedger> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as DeliveryLedger).delivered)) {
      return parsed as DeliveryLedger;
    }
  } catch {
    // first run, or an unreadable file: start from the empty ledger
  }

  return EMPTY_LEDGER;
}

/**
 * One Windows toast per notification. Clicking it brings the window forward
 * and asks the renderer to navigate — the renderer still owns routing.
 */
function showNativeNotification(notification: PendingNotification): void {
  if (!Notification.isSupported()) {
    return;
  }

  const toast = new Notification({ title: notification.title, body: notification.body });
  toast.on('click', () => {
    const [window] = BrowserWindow.getAllWindows();

    if (window === undefined) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    if (notification.link.startsWith('/')) {
      window.webContents.send('budojo:navigate', notification.link);
    }
  });
  toast.show();
}

/**
 * The bearer token, encrypted in the OS keychain (#1227). The renderer reaches
 * it synchronously over the bridge; the main process owns the file and the
 * decrypt cache. Registered once, before any window exists.
 */
function registerTokenVault(): void {
  const vault = new TokenVault(dataLayout(app.getPath('userData')).authTokenFile, safeStorage);
  ipcMain.on('budojo:token:get', (event) => {
    event.returnValue = vault.get();
  });
  ipcMain.on('budojo:token:set', (event, token: unknown) => {
    if (typeof token === 'string' && token.length > 0) {
      vault.set(token);
    }
    event.returnValue = true;
  });
  ipcMain.on('budojo:token:clear', (event) => {
    vault.clear();
    event.returnValue = true;
  });
}

/**
 * Backup/restore bridge (#1228). The renderer asks; the main process does the
 * work through BackupService. Restore is the delicate one — it must run with
 * the PHP server stopped so nothing holds the SQLite file — so it stops the
 * supervisor, swaps, restarts it, and reloads the window onto the restored
 * data. ipcMain.handle (async) rather than sendSync: these are not hot paths.
 */
/**
 * The Drive link (#1301). Every handler answers even when the feature is
 * unavailable — the renderer asks for the state on load, and a rejected
 * invoke there would break the whole Backup page rather than hiding one card.
 */
function registerDriveBridge(driveOf: () => DriveSyncService | null): void {
  ipcMain.handle('budojo:drive:state', async () => {
    const service = driveOf();
    if (service === null) {
      return { configured: false, linked: false };
    }

    return { configured: true, ...(await service.state()) };
  });

  ipcMain.handle('budojo:drive:archives', async () => (await driveOf()?.archives()) ?? []);

  ipcMain.handle('budojo:drive:link', async () => {
    const service = driveOf();

    return service === null ? { ok: false, error: 'not_configured' } : service.link();
  });

  ipcMain.handle('budojo:drive:unlink', async () => {
    await driveOf()?.unlink();

    return { ok: true };
  });

  ipcMain.handle('budojo:drive:sync', async () => {
    const service = driveOf();
    if (service === null) {
      return { ran: false, reason: 'not_linked' };
    }

    // sync() contains its own failures, but the renderer disables a button on
    // this promise — a rejection would leave it spinning forever, so the bridge
    // never rejects either.
    return service.sync().catch((error: unknown) => ({
      ran: true,
      uploaded: 0,
      deleted: 0,
      error: error instanceof Error ? error.message : 'unknown',
    }));
  });
}

/**
 * The backup folder (#1320). Every handler answers even before a folder is
 * chosen — the renderer asks on load, and a rejected invoke would break the
 * whole page rather than one card.
 */
function registerFolderBridge(folderOf: () => FolderCopyService | null): void {
  ipcMain.handle('budojo:folder:state', async () => (await folderOf()?.state()) ?? {
    folder: null,
    lastCopyAt: null,
    lastError: null,
    lastErrorAt: null,
  });

  ipcMain.handle('budojo:folder:choose', async () => {
    const service = folderOf();
    if (service === null) {
      return { ok: false };
    }

    const picked = await dialog.showOpenDialog({
      title: 'Choose a folder for backup copies',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (picked.canceled || picked.filePaths[0] === undefined) {
      return { ok: false };
    }

    const state = await service.setFolder(picked.filePaths[0]);
    // Copy straight away rather than waiting up to six hours: choosing a folder
    // and seeing nothing appear in it reads as broken.
    void service.copy().catch(() => undefined);

    return { ok: true, state };
  });

  ipcMain.handle('budojo:folder:clear', async () => {
    await folderOf()?.setFolder(null);

    return { ok: true };
  });

  ipcMain.handle('budojo:folder:copy', async () => {
    const service = folderOf();

    return service === null
      ? { ran: false, reason: 'no_folder' }
      : service.copy().catch(() => ({ ran: true, copied: 0, deleted: 0, error: 'unknown' }));
  });

  ipcMain.handle('budojo:folder:open', async () => {
    const state = await folderOf()?.state();
    if (state?.folder === undefined || state.folder === null) {
      return { ok: false };
    }

    await shell.openPath(state.folder);

    return { ok: true };
  });
}

function registerBackupBridge(
  supervisorOf: () => PhpSupervisor | null,
  backupOf: () => BackupService | null,
): void {
  ipcMain.handle('budojo:backup:list', async () => (await backupOf()?.list()) ?? []);

  ipcMain.handle('budojo:backup:run', async () => {
    const path = await backupOf()?.backup();

    return { ok: path !== undefined, path: path ?? null };
  });

  ipcMain.handle('budojo:backup:restore', async (_event, name: unknown) => {
    const service = backupOf();
    const supervisor = supervisorOf();
    if (service === null || supervisor === null || typeof name !== 'string') {
      return { ok: false, reason: 'Budojo is not ready to restore yet.' };
    }

    await supervisor.stop();
    let check;
    try {
      check = await service.restore(name);
    } finally {
      await supervisor.start();
    }

    if (check.ok) {
      // The renderer is holding data that no longer exists; reload it onto the
      // restored database.
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.reload();
      }
    }

    return check.ok ? { ok: true } : { ok: false, reason: check.reason };
  });
}

/**
 * Recovery-keys bridge (#1254). Export decrypts the keychain store and hands
 * the renderer a single copy-pasteable recovery code; import writes a provided
 * code's keys back into the store. A backup never carries `secrets.bin`, and
 * the keychain (DPAPI) binds it to the Windows user that created it, so this
 * is the only way to move the keys — and therefore decrypt the documents —
 * onto a fresh machine (see `docs/desktop/backup-restore.md`).
 *
 * Import cannot pick up mid-flight: the running API already has the old
 * `APP_KEY` in its environment. Writing the new key and then **relaunching**
 * is the only thing that makes the bootstrap re-read `secrets.bin` and boot
 * PHP under the new keys — a window reload would keep the old ones.
 */
/**
 * The renderer asks once on boot; every change after that is pushed (#1339).
 *
 * Both halves are needed. Without the pull, a window opened after a download
 * finished shows nothing until the next six-hourly check. Without the push, a
 * download that starts while the window is open is invisible until a reload.
 */
/**
 * Held so the renderer can ask for the install now (#1362).
 *
 * Null in a build that does not self-update, and null until the poll is wired —
 * both of which are the same answer to `installNow`: there is nothing to
 * install.
 */
let updaterRef: { quitAndInstall: (isSilent: boolean, isForceRunAfter: boolean) => void } | null = null;

function registerUpdateBridge(): void {
  ipcMain.handle('budojo:update:status', () => updateStatus);

  ipcMain.handle('budojo:update:install', () => {
    // Guarded on the state, not on the caller's word. A stale click — the bar
    // rendered before an error cleared it, a renderer kept alive across a
    // failed download — must not quit the app to install nothing.
    if (updateStatus.phase !== 'ready' || updaterRef === null) {
      return { ok: false };
    }

    // `isSilent: false` is the whole point: NSIS shows its progress window, so
    // the owner watches it happen instead of closing the app and wondering.
    // `isForceRunAfter: true` brings Budojo back on its own afterwards.
    updaterRef.quitAndInstall(false, true);

    return { ok: true };
  });
}

function registerRecoveryKeysBridge(): void {
  const secretsFile = dataLayout(app.getPath('userData')).secretsFile;

  ipcMain.handle('budojo:keys:export', async () => {
    if (!existsSync(secretsFile)) {
      return { ok: false, reason: 'There are no keys to export yet.' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: 'The OS keychain is unavailable, so the keys cannot be read.' };
    }
    try {
      const secrets = parseSecrets(safeStorage.decryptString(await readFile(secretsFile)));

      return { ok: true, code: encodeRecoveryCode(secrets) };
    } catch {
      return { ok: false, reason: 'The stored keys could not be read.' };
    }
  });

  ipcMain.handle('budojo:keys:import', async (_event, code: unknown) => {
    if (typeof code !== 'string') {
      return { ok: false, reason: 'No recovery code was provided.' };
    }

    const decoded = decodeRecoveryCode(code);
    if (!decoded.ok) {
      return { ok: false, reason: decoded.reason };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: 'The OS keychain is unavailable, so the keys cannot be stored.' };
    }

    await writeFile(secretsFile, safeStorage.encryptString(serializeSecrets(decoded.secrets)), { mode: 0o600 });

    // Relaunch so the bootstrap re-reads secrets.bin and the API comes back up
    // under the imported keys. Deferred a beat so the renderer can surface the
    // result first.
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 900);

    return { ok: true };
  });
}

/**
 * Automatic updates (#1287). Checks the public GitHub releases, downloads in
 * the background and installs on quit — the owner never has to know a release
 * page exists.
 *
 * Nothing is ever installed while the app is open: `autoInstallOnAppQuit` means
 * the swap happens after the last window closes, so an instructor is never
 * interrupted mid-check-in. Failures are logged and swallowed — a machine with
 * no internet must still start the app.
 *
 * Returns the polling task so the caller can stop it on quit, or `null` when
 * this build must not update itself (see `planUpdateCheck`).
 */
/**
 * The update state the renderer paints as a bar (#1339).
 *
 * Module-level rather than threaded through, because it has exactly one writer
 * (the updater's event handlers) and two readers (the `status` handler, for the
 * first paint, and the push below). It stays `idle` forever in a build that
 * does not self-update, which is the correct answer for one.
 */
let updateStatus: UpdateStatus = idleUpdateStatus();

function publishUpdateStatus(next: UpdateStatus): void {
  updateStatus = next;

  // Every window, not just the focused one, and never a destroyed one — a
  // send to a disposed webContents throws and would take the updater's event
  // handler down with it.
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('budojo:update:status', next);
    }
  }
}

function registerAutoUpdate(log: (line: string) => void): PeriodicTask | null {
  const decision = planUpdateCheck({
    packaged: app.isPackaged,
    dev: DEV,
    portableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
    version: app.getVersion(),
  });

  if (!decision.check) {
    log(`[update] not checking — ${decision.reason}`);

    return null;
  }

  // Resolved here, not at import time: it is a getter that reads app metadata.
  const updater = electronUpdater.autoUpdater;

  updater.autoDownload = true;
  // Unchanged, and deliberately: closing the app still installs silently, so
  // nothing regresses for someone who would rather not think about it. The
  // button #1362 adds is a second path, not a replacement.
  updater.autoInstallOnAppQuit = true;
  updaterRef = updater;

  updater.on('checking-for-update', () => log('[update] checking'));
  updater.on('update-not-available', () => log('[update] already current'));
  updater.on('update-available', (info: { version: string }) => {
    log(`[update] ${info.version} available, downloading`);
    publishUpdateStatus(onUpdateAvailable(updateStatus, info.version));
  });
  // Not logged: this fires many times a second, and a rotating log full of
  // percentages is a rotating log with nothing else left in it.
  updater.on('download-progress', (progress: { percent: number }) =>
    publishUpdateStatus(onDownloadProgress(updateStatus, progress.percent)),
  );
  updater.on('update-downloaded', (info: { version: string }) => {
    log(`[update] ${info.version} downloaded — installs on quit`);
    publishUpdateStatus(onUpdateDownloaded(updateStatus, info.version));
    const { title, body } = updateReadyMessage(info.version);
    new Notification({ title, body }).show();
  });
  updater.on('error', (error: Error) => {
    // Offline, rate-limited, release yanked — none of these are worth a dialog
    // or a crash. The log is where a maintainer looks; the user sees nothing,
    // and an already-downloaded update keeps its bar (see `onUpdateError`).
    log(`[update] check failed: ${updateFailureLine(error.message)}`);
    publishUpdateStatus(onUpdateError(updateStatus));
  });

  const poll = new PeriodicTask({
    run: async () => {
      // Swallowed on purpose: the `error` handler above has already logged a
      // one-line reason, and letting the rejection through made the task print
      // the same forty-line HTTP dump a second time.
      try {
        await updater.checkForUpdates();
      } catch {
        /* already reported */
      }

      return { code: 0, output: '', timedOut: false };
    },
    log,
    intervalMs: 6 * 60 * 60_000,
    // Not at zero: the first minute belongs to booting PHP and painting a
    // window, not to a network round-trip.
    initialDelayMs: 45_000,
  });
  poll.start();

  return poll;
}

/**
 * Two copies of the app would open two connections to the same SQLite file and
 * two scheduler ticks against the same rows. Focus the existing window instead.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let supervisor: PhpSupervisor | null = null;
  let scheduler: PeriodicTask | null = null;
  let notifierPoll: PeriodicTask | null = null;
  let backupService: BackupService | null = null;
  let driveService: DriveSyncService | null = null;
  let folderCopy: FolderCopyService | null = null;
  let backupPoll: PeriodicTask | null = null;
  let updatePoll: PeriodicTask | null = null;
  let quitting = false;

  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();

    if (existing) {
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    }
  });

  void app.whenReady().then(async () => {
    // Registered in development too. Only the URL the window loads differs, so
    // the packaged code path is exercised on every dev run rather than first
    // meeting reality inside an installer.
    // Electron installs a default File / Edit / View / Window / Help bar. It
    // belongs to a text editor, not to this: every entry is either irrelevant
    // (Reload, Toggle Developer Tools) or duplicated by the app's own UI. On
    // Windows the editing shortcuts inside inputs come from Chromium, not from
    // the menu, so dropping it costs nothing — if copy/paste ever misbehaves,
    // the fix is a roles-only menu that is never displayed, not the bar back.
    Menu.setApplicationMenu(null);

    registerAppProtocol();
    registerTokenVault();
    registerRecoveryKeysBridge();
    registerUpdateBridge();

    // Registered before the runtime starts, and independent of it: an install
    // that cannot boot its API should still be able to update itself out of
    // that state.
    const updateLog = new RotatingLog(path.join(dataLayout(app.getPath('userData')).logsDir, 'update.log'));
    updateLog.open();
    updatePoll = registerAutoUpdate((line) => updateLog.write(`${new Date().toISOString()} ${line}`));

    let apiBase: string;

    try {
      const runtime = await startRuntime();
      supervisor = runtime.supervisor;
      scheduler = runtime.scheduler;
      notifierPoll = runtime.notifierPoll;
      backupService = runtime.backupService;
      backupPoll = runtime.backupPoll;
      driveService = runtime.driveService;
      folderCopy = runtime.folderCopy;
      registerBackupBridge(() => supervisor, () => backupService);
      registerDriveBridge(() => driveService);
      registerFolderBridge(() => folderCopy);
      apiBase = runtime.apiBase;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox('Budojo could not start', message);
      app.exit(1);

      return;
    }

    createWindow(apiBase);

    // macOS keeps the app alive with no windows; recreate on dock click.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(apiBase);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Stopping the runtime is asynchronous and Electron will not wait on its
  // own: hold the quit, stop, then finish quitting. The flag makes the second
  // pass — the one our own app.quit() triggers — fall straight through.
  app.on('before-quit', (event) => {
    if (quitting || supervisor === null) {
      return;
    }

    quitting = true;
    event.preventDefault();

    // Scheduler first: an in-flight schedule:run must not meet a server that
    // is already going away, and it must not outlive the app.
    const stopping = supervisor;
    void Promise.all([scheduler?.stop(), notifierPoll?.stop(), backupPoll?.stop(), updatePoll?.stop()])
      .catch(() => undefined)
      .then(() => stopping.stop())
      .catch(() => undefined)
      .then(() => app.quit());
  });
}
