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
 *   - GET /dashboard/stats (any extensionless path with no static
 *     file behind it AND a browser-navigation Accept header)
 *                                                     →  /index.html (HTTP 200)
 *   - POST/OPTIONS /dashboard/stats                   →  404 (not the SPA shell)
 *   - GET /dashboard/stats with no `text/html` in Accept
 *     (programmatic fetch / XHR)                      →  404 (not the SPA shell)
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

// Paths the Angular Service Worker (and the SPA shell itself) must
// always fetch fresh, never from any HTTP cache. Caching `/ngsw.json`
// or `/index.html` is the canonical Angular SW failure mode — the SW
// reads the cached manifest, sees no version change, and never fires
// `VERSION_READY`, leaving users on the old bundle until they manually
// clear browser cache. Customer feedback on v1.15.0 reported exactly
// this symptom (#398). `/safety-worker.js` is Angular's kill-switch
// worker; if a future deploy ever ships it to deactivate the SW, it
// must also bypass cache.
const NO_CACHE_PATHS = new Set([
  '/index.html',
  '/ngsw.json',
  '/ngsw-worker.js',
  '/safety-worker.js',
]);

const NO_CACHE_HEADER = 'no-cache, no-store, must-revalidate';

// `env.ASSETS.fetch()` returns a `Response` with immutable headers —
// `response.headers.set(...)` throws at runtime. Cloning via
// `new Response(body, { ... })` is the canonical pattern for
// rewriting headers on a Cloudflare-binding response. Spreading the
// existing entries preserves Content-Type / Content-Length / ETag
// etc.; only Cache-Control + Pragma + Expires are overridden.
function withNoCache(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', NO_CACHE_HEADER);
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// True only for top-level browser navigations: the fallback to
// /index.html exists so users can paste a deep link like
// /dashboard/stats and get the SPA shell. It must NOT fire for
// programmatic requests — POST / OPTIONS preflight, JSON XHR /
// fetch — those want their original 404 propagated. Detection
// rule: GET or HEAD method AND `Accept` includes `text/html`
// (the canonical browser-navigation Accept header). `fetch()`
// from JS defaults to `Accept: */*`, which fails the substring
// check and surfaces the real 404 — exactly what we want.
function isNavigationRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }
  const accept = request.headers.get('Accept') ?? '';
  return accept.includes('text/html');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404) {
      // Stamp NO_CACHE_PATHS on the way out so the SW manifest, the
      // SW worker file, and the SPA shell are never served from any
      // intermediate cache (browser HTTP cache, Cloudflare edge, or a
      // corporate proxy). See `NO_CACHE_PATHS` block above.
      if (NO_CACHE_PATHS.has(url.pathname)) {
        return withNoCache(response);
      }
      return response;
    }

    if (ASSET_EXT_RE.test(url.pathname)) {
      // Asset-shaped path with no file behind it. Surface the real 404
      // so the browser's dynamic-import reject path can fire cleanly,
      // instead of poisoning the JS engine with HTML.
      return response;
    }

    if (!isNavigationRequest(request)) {
      // Extensionless path but NOT a browser navigation — e.g. a
      // POST, an OPTIONS preflight, or a `fetch()` with
      // `Accept: application/json`. Serving HTML to these would
      // confuse the caller (or worse, succeed with status 200 and
      // a body the JSON parser chokes on). Pass the 404 through.
      return response;
    }

    // Navigation request (GET/HEAD, browser-style Accept) → serve
    // the SPA shell so a deep link like /dashboard/stats keeps
    // working when the user pastes it into a fresh tab. Build a
    // Request for /index.html that forwards method + headers + body
    // so the binding's content negotiation (e.g. Accept-Encoding
    // for the gzipped variant) continues to work. The SPA shell
    // itself must bypass any HTTP cache (#398) — wrap with the same
    // no-cache headers as a direct GET /index.html.
    const indexUrl = new URL('/index.html', request.url);
    const indexResponse = await env.ASSETS.fetch(new Request(indexUrl, request));
    return withNoCache(indexResponse);
  },
};
