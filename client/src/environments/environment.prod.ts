/**
 * Production Angular environment — swapped in by `fileReplacements` in
 * `angular.json` when building with `--configuration=production`
 * (the default for `npm run build`).
 *
 * `apiBase` points at the API host directly, so HTTP services emit
 * absolute URLs and the browser issues real cross-origin requests.
 * CORS is enforced server-side by the Laravel allowlist
 * (`server/config/cors.php` reading `CORS_ALLOWED_ORIGINS` on Forge).
 *
 * Why not a Cloudflare Pages `_redirects` proxy:
 * Pages 200-status rewrites only proxy same-origin destinations.
 * External URLs in `_redirects` are silently ignored — the rule is a
 * no-op and the request falls through to the SPA fallback. We tried
 * that path in #136 / #126 and it broke production registration
 * end-to-end (POST /api/* returned 405 because Pages can't serve HTML
 * on non-GET methods). Switching to absolute URLs is the standard SPA
 * + cross-origin-API architecture and bypasses the Pages limitation.
 */
export const environment = {
  production: true,
  apiBase: 'https://api.budojo.it',
};
