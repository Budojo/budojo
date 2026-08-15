import type { ClientRuntime } from './runtime';

/**
 * Desktop Angular environment (#1224) — swapped in by `fileReplacements` for
 * `ng build --configuration desktop`.
 *
 * `apiBase` is a getter, not a constant: the API listens on whatever loopback
 * port the supervised PHP process bound at launch (#1222), so it cannot be
 * baked into the bundle. The Electron preload publishes it on
 * `window.__BUDOJO__` before any script runs, and services read
 * `environment.apiBase` at construction — after that — so a getter is exactly
 * late enough and needs no async bootstrap dance.
 *
 * Empty fallback = same-origin relative URLs, which is what a renderer opened
 * outside Electron (a browser tab on the built files) would need to fail
 * loudly rather than call a stale host.
 */
export const environment = {
  runtime: 'desktop' as ClientRuntime,
  production: true,
  get apiBase(): string {
    return window.__BUDOJO__?.apiBase ?? '';
  },
};
