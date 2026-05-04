/**
 * Stale-chunk recovery: detects dynamic-import failures caused by a stale
 * cached `main` bundle referencing chunks that no longer exist on the
 * current deploy, and triggers a single full-page reload to pick up a
 * fresh `index.html` with current chunk hashes.
 *
 * Why this is necessary: our Cloudflare Workers Static Assets binding is
 * configured with `not_found_handling: "single-page-application"` so that
 * direct navigation to deep routes (e.g. `/dashboard/stats`) serves the
 * SPA shell. But that fallback applies to *every* 404, including missing
 * chunk files — Cloudflare answers `200 text/html` for a `chunk-XXX.js`
 * that's not on the deploy, the browser tries to import HTML as an ES
 * module, and the failure surfaces downstream as an obscure runtime
 * error (the stack trace ends in an RxJS `subscribe` with `.url` on
 * undefined). Without this recovery, the page renders blank and only
 * a manual hard refresh fixes it (#376 follow-up).
 *
 * The proper fix lives in `worker/index.ts` — that worker scopes the SPA
 * fallback to navigation requests, so a missing chunk surfaces as a
 * real 404. This recovery is the belt-and-braces FE side that catches
 * the same class of failure (e.g. cached SW state) and self-heals
 * without requiring the user to reload manually.
 *
 * Anti-loop guard: a single sessionStorage flag prevents an infinite
 * reload if the post-reload bundle ALSO triggers a stale-chunk error
 * (e.g. genuine deploy gap, network issue). After one failed recovery
 * we surface the original error in the console instead.
 */

const RELOAD_FLAG_KEY = 'budojo-stale-chunk-reload-attempted';

const STALE_CHUNK_MESSAGE_PATTERNS: readonly RegExp[] = [
  // Native Chrome / Firefox / Safari error when a dynamic import returns
  // a non-JS payload or fails outright.
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  // Webpack-style chunk-load error message (kept for safety; Vite/esbuild
  // doesn't usually emit this string but a future builder swap may).
  /Loading chunk [\w-]+ failed/i,
  // Browser-specific MIME-type mismatch when an HTML payload is parsed
  // as a JS module. Chrome phrases it "MIME type of 'text/html'", Firefox
  // "MIME type ('text/html')" — the lenient pattern catches both.
  /MIME type.*text\/html/i,
  // SyntaxError flavor when the HTML doctype lands in the JS parser.
  /Unexpected token ['"]?<['"]?/i,
];

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return '';
}

function looksLikeStaleChunk(message: string): boolean {
  return STALE_CHUNK_MESSAGE_PATTERNS.some((re) => re.test(message));
}

function reloadOnce(reason: string): void {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG_KEY)) {
      // Already reloaded once — refusing to loop. The reason is logged
      // so a developer opening the console can still see the failure
      // shape and triage from there.
      console.error(
        `[stale-chunk-recovery] reload already attempted in this session — not reloading again. Reason: ${reason}`,
      );
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
  } catch {
    // sessionStorage can throw in private mode / quota; degrade gracefully
    // and reload anyway. Worst case is a single extra reload on a tab
    // that legitimately can't recover, which is no worse than the bug
    // itself.
  }
  console.warn(
    `[stale-chunk-recovery] stale-chunk failure detected (${reason}); reloading to pick up the current bundle.`,
  );
  window.location.reload();
}

/**
 * Wires the global `error` and `unhandledrejection` listeners. Call
 * once, before `bootstrapApplication()`, so the recovery is armed for
 * the very first lazy import (preload kicks in immediately after the
 * initial NavigationEnd).
 */
export function setupStaleChunkRecovery(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const message = messageOf(event.error) || event.message || '';
    if (looksLikeStaleChunk(message)) reloadOnce(message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = messageOf(event.reason);
    if (looksLikeStaleChunk(message)) reloadOnce(message);
  });
}
