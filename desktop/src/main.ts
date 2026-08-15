import { app, BrowserWindow, protocol, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contentTypeFor, resolveAppRequest } from './protocol.js';

/**
 * Electron main process for Budojo Desktop (#1221, part of M11 #1218).
 *
 * Responsibilities kept here deliberately: scheme registration, window
 * lifecycle, and the single-instance lock. Supervising the bundled PHP runtime
 * (#1222) and the first-run bootstrap (#1223) land as separate modules — this
 * file stays the wiring, not the logic.
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

function createWindow(): BrowserWindow {
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
      // How the renderer learns the API port. #1222 replaces the literal with
      // the port the supervised PHP process actually bound.
      additionalArguments: [`--budojo-api-base=${process.env['BUDOJO_API_BASE'] ?? ''}`],
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
 * Two copies of the app would open two connections to the same SQLite file and
 * two scheduler ticks against the same rows. Focus the existing window instead.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();

    if (existing) {
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    }
  });

  void app.whenReady().then(() => {
    // Registered in development too. Only the URL the window loads differs, so
    // the packaged code path is exercised on every dev run rather than first
    // meeting reality inside an installer.
    registerAppProtocol();

    createWindow();

    // macOS keeps the app alive with no windows; recreate on dock click.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
