import { app, BrowserWindow, dialog, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPhpEnv, buildPhpIni, resolveDesktopPaths } from './php-runtime.js';
import { PhpSupervisor } from './php-supervisor.js';
import { contentTypeFor, resolveAppRequest } from './protocol.js';

/**
 * Electron main process for Budojo Desktop (M11 #1218).
 *
 * Wiring only: scheme registration, window lifecycle, single-instance lock,
 * and the order of operations at boot — start the PHP runtime (#1222), then
 * open a window that knows its port. The logic lives in the modules imported
 * above, each unit-tested on its own; the first-run bootstrap (#1223) slots in
 * between "runtime ready" and "window", and does not exist yet.
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

  void window.loadURL(DEV ? DEV_URL : `${APP_ORIGIN}/index.html`);

  return window;
}

/**
 * Boots the PHP runtime and returns its base URL. Every failure path ends in a
 * native error box with the log location — never a blank renderer.
 */
async function startRuntime(): Promise<{ supervisor: PhpSupervisor; apiBase: string }> {
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
  // executable — Program Files is read-only. The layout is the one #1223
  // formalises; only what the runtime itself needs is created here.
  const dataDir = app.getPath('userData');
  const logDir = path.join(dataDir, 'logs');
  const tempDir = path.join(dataDir, 'tmp');
  await Promise.all([mkdir(logDir, { recursive: true }), mkdir(tempDir, { recursive: true })]);

  const databasePath = path.join(dataDir, 'budojo.sqlite');

  const supervisor = new PhpSupervisor({
    phpBinary: paths.phpBinary,
    serverRoot: paths.serverRoot,
    iniPath: path.join(dataDir, 'php.ini'),
    iniContent: buildPhpIni({
      extensionDir: paths.phpExtensionDir,
      errorLog: path.join(logDir, 'php-error.log'),
      tempDir,
    }),
    logDir,
    pidFile: path.join(dataDir, 'php-server.pid'),
    appLogPath: path.join(paths.serverRoot, 'storage', 'logs', 'laravel.log'),
    // In development Laravel still reads server/.env for APP_KEY and friends;
    // the values below override the ones that must differ on the desktop.
    // Packaged builds have no .env — #1223 supplies the secrets via `extra`.
    envForPort: (port) => buildPhpEnv({ port, databasePath, rendererOrigin: APP_ORIGIN }, process.env),
    onFatal: (error, context) => {
      dialog.showErrorBox(
        'Budojo stopped working',
        `${error.message}\n\nLog: ${context.logPath}\n\n${context.recentOutput}`,
      );
      app.exit(1);
    },
  });

  const { port } = await supervisor.start();

  return { supervisor, apiBase: `http://127.0.0.1:${port}` };
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

    let apiBase: string;

    try {
      const runtime = await startRuntime();
      supervisor = runtime.supervisor;
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

    void supervisor
      .stop()
      .catch(() => undefined)
      .then(() => app.quit());
  });
}
