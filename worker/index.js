/**
 * Cloudflare Workers entry-point that fronts the static-asset binding for
 * the Budojo SPA on `budojo.it`. Closes #382 — replaces the
 * `not_found_handling: "single-page-application"` flag on the ASSETS
 * binding (which served `/index.html` with HTTP 200 for *every* unknown
 * path, including missing chunk files) with a navigation-only fallback.
 *
 * The bug this fixes:
 *
 *   $ curl -H "Accept: application/javascript" \
 *          https://budojo.it/chunk-DOES-NOT-EXIST.js
 *   → HTTP 200 type text/html size 16281        (= the SPA index.html)
 *
 * The browser, on a stale `main` bundle whose dynamic-import targets
 * had been removed by a newer deploy, would receive HTML when asking
 * for an ES module. The failure surfaced downstream as a runtime
 * `TypeError: Cannot read properties of undefined (reading 'url')`
 * inside an RxJS `subscribe` chain — an opaque crash that blanked the
 * dashboard and required a manual hard refresh to recover (the same
 * symptom v1.14.1 / v1.14.2 chased on different theories before
 * v1.14.3 nailed the actual route-snapshot bug).
 *
 * Behaviour after this worker:
 *   - GET /chunk-XXX.js when the chunk doesn't exist  →  404
 *   - GET /assets/foo.png when the file doesn't exist →  404
 *   - GET /dashboard/stats (any path without an asset extension,
 *     when no static file matches)                    →  /index.html (HTTP 200)
 *   - GET /chunk-XXX.js when the chunk DOES exist     →  200 type text/javascript
 *   - GET /index.html                                 →  unchanged
 *
 * The frontend self-heal added in #381 (v1.14.2) stays as belt-and-
 * braces: it catches the 404 on the lazy-import path and reloads the
 * tab once to pick up a fresh `index.html` with current chunk hashes.
 *
 * Configuration: in `wrangler.jsonc`, the binding now sets
 * `not_found_handling: "none"` so a missing asset surfaces as a real
 * 404 inside this worker's `fetch` — without that flag, the binding
 * itself rewrites every 404 to the SPA shell and the worker can't
 * tell asset misses from navigation routes.
 */

// Anything matching this regex is treated as a static-asset request:
// a missing file at the path → real 404, NOT the SPA fallback.
const ASSET_EXT_RE = /\.(?:js|css|map|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|txt|xml|webmanifest|wasm|mp3|mp4|webm)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404) {
      return response;
    }

    if (ASSET_EXT_RE.test(url.pathname)) {
      // Asset-shaped path with no file behind it. Surface the real 404
      // so the browser's dynamic-import reject path can fire cleanly,
      // instead of poisoning the JS engine with HTML.
      return response;
    }

    // Navigation request (no asset extension) → serve the SPA shell so
    // a deep link like /dashboard/stats keeps working when the user
    // pastes it into a fresh tab. Build a Request for /index.html that
    // forwards method + headers + body so the binding's content
    // negotiation (e.g. Accept-Encoding for the gzipped variant)
    // continues to work.
    const indexUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
