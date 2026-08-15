import type { ClientRuntime } from './runtime';

/**
 * Production Angular environment for a *web* deployment — swapped in by
 * `fileReplacements` in `angular.json` when building with
 * `--configuration=production` (the default for `npm run build`).
 *
 * The hosted deployment this file used to point at (Cloudflare Pages SPA +
 * `api.budojo.it` on a Forge-managed droplet) was decommissioned in #1230 as
 * part of M11 (#1218); the product now ships as a desktop app, which builds
 * with `--configuration=desktop` and `environment.desktop.ts` instead.
 *
 * `apiBase` is therefore empty: HTTP services emit same-origin relative URLs
 * (`/api/v1/...`), which is what a web host that proxies `/api/*` to the API
 * needs. A future hosted deployment that serves the API on a separate origin
 * sets its own absolute host here — and remembers the lesson of #136 / #126:
 * a static host's redirect rules cannot proxy cross-origin `POST`s, so the
 * choice is a real reverse proxy or absolute URLs + a CORS allowlist.
 */
export const environment = {
  runtime: 'web' as ClientRuntime,
  production: true,
  apiBase: '',
};
