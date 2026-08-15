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
  // Recovery keys (#1254). Export decrypts the keychain store into a copy-
  // pasteable code; import writes it back and the app relaunches under the new
  // keys. Async; not hot paths.
  keys: {
    export: () => ipcRenderer.invoke('budojo:keys:export'),
    import: (code: string) => ipcRenderer.invoke('budojo:keys:import', code),
  },
});
