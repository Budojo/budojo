import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire surface the renderer gets (#1221, #1225).
 *
 * Deliberately tiny: where to send API calls, which platform this is, and one
 * event — "navigate here" — that a clicked native toast raises. Everything
 * else Angular needs it gets over HTTP from the API like the web app does.
 *
 * `apiBase` arrives through `additionalArguments` rather than an IPC
 * round-trip so it is readable synchronously during Angular's bootstrap,
 * before the first HTTP request is made.
 *
 * Written as `.cts` on purpose: preload scripts run as CommonJS, and with
 * `sandbox: true` an ESM preload is not loaded at all.
 */

const API_BASE_FLAG = '--budojo-api-base=';
const NAVIGATE_CHANNEL = 'budojo:navigate';
const TOKEN_GET = 'budojo:token:get';
const TOKEN_SET = 'budojo:token:set';
const TOKEN_CLEAR = 'budojo:token:clear';
const UPDATE_STATUS_CHANNEL = 'budojo:update:status';

function readApiBase(): string {
  const flag = process.argv.find((argument) => argument.startsWith(API_BASE_FLAG));

  // Empty means "same origin" — which is what `ng serve` + proxy.conf.json
  // already give us in development.
  return flag === undefined ? '' : flag.slice(API_BASE_FLAG.length);
}

contextBridge.exposeInMainWorld('__BUDOJO__', {
  apiBase: readApiBase(),
  platform: process.platform,
  /**
   * The running app version, for the title bar (#1401). A promise rather than
   * a constant because `app.getVersion()` lives in the main process, and the
   * preload has no business reading packaged metadata itself.
   */
  version: () => ipcRenderer.invoke('budojo:app:version'),
  /**
   * Subscribes to navigation requests from the main process (a clicked toast).
   * Only in-app paths are forwarded; the renderer still owns the routing.
   * Returns the unsubscribe function.
   */
  onNavigate(callback: (path: string) => void): () => void {
    const listener = (_event: unknown, path: unknown): void => {
      if (typeof path === 'string' && path.startsWith('/')) {
        callback(path);
      }
    };
    ipcRenderer.on(NAVIGATE_CHANNEL, listener);

    return () => ipcRenderer.removeListener(NAVIGATE_CHANNEL, listener);
  },
  // The token is held encrypted in the OS keychain by the main process
  // (#1227). sendSync keeps token.get() synchronous — the interceptor reads
  // it inline — and the main process caches the decrypt so it stays cheap.
  token: {
    get(): string | null {
      const value: unknown = ipcRenderer.sendSync(TOKEN_GET);
      return typeof value === 'string' ? value : null;
    },
    set(token: string): void {
      ipcRenderer.sendSync(TOKEN_SET, token);
    },
    clear(): void {
      ipcRenderer.sendSync(TOKEN_CLEAR);
    },
  },
  // Backup & restore (#1228). Async; not hot paths.
  backup: {
    list: () => ipcRenderer.invoke('budojo:backup:list'),
    run: () => ipcRenderer.invoke('budojo:backup:run'),
    restore: (name: string) => ipcRenderer.invoke('budojo:backup:restore', name),
  },
  // Google Drive backup sync (#1301). Opt-in and off by default. `state()`
  // answers even when the build carries no OAuth client — it returns
  // `configured: false` so the page can say the feature is unavailable instead
  // of offering a Connect button that opens a Google error.
  drive: {
    state: () => ipcRenderer.invoke('budojo:drive:state'),
    archives: () => ipcRenderer.invoke('budojo:drive:archives'),
    link: () => ipcRenderer.invoke('budojo:drive:link'),
    unlink: () => ipcRenderer.invoke('budojo:drive:unlink'),
    sync: () => ipcRenderer.invoke('budojo:drive:sync'),
  },
  // Backup folder (#1320). The owner picks any folder — a synced one, a NAS, a
  // USB stick — and every backup is copied there. No account, no API.
  folder: {
    state: () => ipcRenderer.invoke('budojo:folder:state'),
    choose: () => ipcRenderer.invoke('budojo:folder:choose'),
    clear: () => ipcRenderer.invoke('budojo:folder:clear'),
    copy: () => ipcRenderer.invoke('budojo:folder:copy'),
    open: () => ipcRenderer.invoke('budojo:folder:open'),
  },
  // Auto-update progress (#1339). `status()` answers the current state for the
  // first paint; `onStatus` pushes every change after that, so a download that
  // starts while the window is open shows up without polling.
  update: {
    status: () => ipcRenderer.invoke('budojo:update:status'),
    // Ask now rather than waiting for the six-hourly poll (#1401). What it
    // found comes back through `onStatus`, not from here — this only reports
    // whether the check could be started at all.
    check: () => ipcRenderer.invoke('budojo:update:check'),
    // Runs the installer NOW, visibly, and relaunches (#1362). Closing the app
    // normally still installs silently on quit — this is the opt-in path for
    // someone who would rather watch it happen than wonder.
    installNow: () => ipcRenderer.invoke('budojo:update:install'),
    onStatus(callback: (status: unknown) => void): () => void {
      const listener = (_event: unknown, status: unknown): void => callback(status);
      ipcRenderer.on(UPDATE_STATUS_CHANNEL, listener);

      return () => ipcRenderer.removeListener(UPDATE_STATUS_CHANNEL, listener);
    },
  },
  // Recovery keys (#1254). Export decrypts the keychain store into a copy-
  // pasteable code; import writes it back and the app relaunches under the new
  // keys. Async; not hot paths.
  keys: {
    export: () => ipcRenderer.invoke('budojo:keys:export'),
    import: (code: string) => ipcRenderer.invoke('budojo:keys:import', code),
  },
});
