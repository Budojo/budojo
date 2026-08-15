import { app, BrowserWindow, dialog, ipcMain, Notification, protocol, safeStorage, shell } from 'electron';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dataLayout, runBootstrap, type Secrets } from './bootstrap.js';
import { DesktopNotifier, EMPTY_LEDGER, parseListOutput, type DeliveryLedger, type PendingNotification } from './desktop-notifier.js';
import { buildPhpEnv, buildPhpIni, resolveDesktopPaths } from './php-runtime.js';
import { runPhp } from './php-exec.js';
import { PhpSupervisor } from './php-supervisor.js';
import { RotatingLog } from './rotating-log.js';
import { TokenVault } from './token-vault.js';
import { PeriodicTask } from './periodic-task.js';
import { contentTypeFor, resolveAppRequest } from './protocol.js';

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

function createWindow(apiBase: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#111827',
    title: 'Budojo',
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

  return { supervisor, scheduler, notifierPoll, apiBase: `http://127.0.0.1:${port}` };
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
    registerAppProtocol();
    registerTokenVault();

    let apiBase: string;

    try {
      const runtime = await startRuntime();
      supervisor = runtime.supervisor;
      scheduler = runtime.scheduler;
      notifierPoll = runtime.notifierPoll;
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
    void Promise.all([scheduler?.stop(), notifierPoll?.stop()])
      .catch(() => undefined)
      .then(() => stopping.stop())
      .catch(() => undefined)
      .then(() => app.quit());
  });
}
