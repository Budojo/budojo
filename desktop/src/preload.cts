import { contextBridge } from 'electron';

/**
 * The entire surface the renderer gets (#1221).
 *
 * Deliberately tiny. Everything Angular needs today is one string — where to
 * send API calls — and the port is only known at launch, so it cannot be baked
 * into the bundle at build time (#1224).
 *
 * It arrives through `additionalArguments` rather than an IPC round-trip so it
 * is readable synchronously during Angular's bootstrap, before the first HTTP
 * request is made. An async getter would mean either blocking sync IPC or
 * deferring bootstrap, and neither is worth it for a constant.
 *
 * Written as `.cts` on purpose: preload scripts run as CommonJS, and with
 * `sandbox: true` an ESM preload is not loaded at all.
 */

const API_BASE_FLAG = '--budojo-api-base=';

function readApiBase(): string {
  const flag = process.argv.find((argument) => argument.startsWith(API_BASE_FLAG));

  // Empty means "same origin" — which is what `ng serve` + proxy.conf.json
  // already give us in development.
  return flag === undefined ? '' : flag.slice(API_BASE_FLAG.length);
}

contextBridge.exposeInMainWorld('__BUDOJO__', {
  apiBase: readApiBase(),
  platform: process.platform,
});
