import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Routing for the custom `app://` scheme that serves the Angular build inside
 * Electron.
 *
 * Why a custom scheme rather than `file://`: Angular uses `PathLocationStrategy`,
 * which needs a real origin and a working History API. Under `file://` there is
 * no origin, deep links break, module scripts are blocked by any sane CSP, and
 * the usual workaround is `webSecurity: false` — turning off the sandbox to fix
 * a routing problem. A scheme registered as `standard` + `secure` gives the
 * renderer a genuine origin, so routing, relative assets and fetch behave the
 * way they already do on the web.
 *
 * Why the fallback is conditional: this reimplements the rule enforced in
 * production today by `worker/index.js` (#382). Serving `index.html` for a
 * missing `chunk-*.js` hands HTML to the JS engine; the dynamic import rejects
 * with an opaque `TypeError` and the dashboard goes blank, with a hard refresh
 * as the only recovery. Cloudflare's asset binding did that by default, and a
 * naive Electron handler does it just as readily. An asset-shaped path that is
 * missing must 404 for real.
 */

/** Asset-shaped paths: a miss here is a real 404, never the SPA shell. */
const ASSET_EXT_RE =
  /\.(?:js|mjs|css|map|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|txt|xml|webmanifest|wasm|mp3|mp4|webm)$/i;

export type AppRequestResolution =
  | { kind: 'file'; path: string }
  | {
      kind: 'not-found';
      reason: 'missing-asset' | 'not-a-navigation' | 'outside-root' | 'missing-shell';
    };

/**
 * Maps a URL pathname to an absolute path inside `root`, or null if it escapes.
 *
 * The renderer is sandboxed, but this handler runs in the main process with
 * full filesystem access — a crafted path must never become an arbitrary file
 * read. Decoding happens before normalising so `%2e%2e` is caught alongside a
 * literal `..`.
 */
export function resolveWithinRoot(root: string, pathname: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding: refuse rather than guess.
    return null;
  }

  const resolvedRoot = path.resolve(root);

  // Resolve the raw decoded path rather than pre-normalising it. Normalising
  // first would collapse a leading ".." against the filesystem root and quietly
  // re-anchor the result inside the root, which makes the containment check below
  // impossible to fail — a guard that cannot fail is worse than no guard,
  // because it reads like protection. Let path.resolve climb out, then refuse.
  const candidate = path.resolve(resolvedRoot, '.' + decoded);

  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  return candidate;
}

/**
 * True only for top-level browser navigations.
 *
 * The `index.html` fallback exists so a deep link renders the SPA shell. It
 * must not fire for programmatic requests: `fetch()` defaults to a wildcard
 * Accept header, which fails this check and correctly surfaces the underlying
 * 404 instead of handing a JSON parser a page of HTML.
 */
export function isNavigationRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  return (request.headers.get('Accept') ?? '').includes('text/html');
}

/**
 * Decides what to serve for one `app://` request.
 *
 * `fileExists` is injected so the decision table is testable without touching
 * a real filesystem; production passes {@link existsSync}.
 */
export function resolveAppRequest(
  root: string,
  pathname: string,
  request: Request,
  fileExists: (absolutePath: string) => boolean = existsSync,
): AppRequestResolution {
  const target = resolveWithinRoot(root, pathname);

  if (target === null) {
    return { kind: 'not-found', reason: 'outside-root' };
  }

  if (fileExists(target) && pathname !== '/') {
    return { kind: 'file', path: target };
  }

  if (ASSET_EXT_RE.test(pathname)) {
    return { kind: 'not-found', reason: 'missing-asset' };
  }

  if (!isNavigationRequest(request)) {
    return { kind: 'not-found', reason: 'not-a-navigation' };
  }

  const shell = path.join(path.resolve(root), 'index.html');

  if (!fileExists(shell)) {
    return { kind: 'not-found', reason: 'missing-shell' };
  }

  return { kind: 'file', path: shell };
}

/**
 * Content types for everything an Angular build emits.
 *
 * Electron's `protocol.handle` does not guess: a `Response` without a
 * Content-Type leaves the renderer to sniff, and a module script that arrives
 * unlabelled simply never executes. That is the same silent-blank-dashboard
 * failure the 404 rule above exists to prevent, arriving by a different door,
 * so the mapping is explicit rather than delegated to a dependency.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  wasm: 'application/wasm',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();

  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
