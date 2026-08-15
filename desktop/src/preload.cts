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
});
