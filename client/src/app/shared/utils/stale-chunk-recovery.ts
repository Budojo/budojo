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
 * a manual hard refresh fixes it.
 *
 * The proper root-cause fix lives at the Cloudflare layer (a custom
 * worker that scopes the SPA fallback to navigation requests so missing
 * asset paths surface as real 404s). That work is tracked separately
 * in issue #382 — it needs wrangler local testing infra and a preview
 * deploy. This recovery is the belt-and-braces FE side that catches
 * the same class of failure (cached SW state, edge-cache lag) and
 * self-heals without requiring the user to reload manually, regardless
 * of the deploy configuration.
 *
 * Anti-loop guards (two layers, by design):
 *
 *  1. **In-memory** (`attemptedThisSession`) — same-JS-session guard.
 *     Prevents a chatty stale-chunk error from triggering reload more
 *     than once in the same tab. Doesn't survive the reload itself.
 *
 *  2. **`sessionStorage`** (`RELOAD_FLAG_KEY`) — cross-reload guard.
 *     Survives the reload so a recurring failure on the post-reload
 *     bundle is logged but doesn't loop. Cleared automatically once
 *     the SPA has run for `RECOVERY_VERIFIED_AFTER_MS` without
 *     crashing — so a long-lived session that recovers once still
 *     auto-heals on the *next* deploy mismatch hours later.
 *
 *  If `sessionStorage` is unavailable (private-mode quota, locked
 *  origin), we deliberately refuse to reload at all — without
 *  persistent state we can't safely break out of a reload loop, so
 *  leaving the user on the broken page is the lesser evil.
 */

const RELOAD_FLAG_KEY = 'budojo-stale-chunk-reload-attempted';
const RECOVERY_VERIFIED_AFTER_MS = 30_000;

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

/**
 * Wires the global `error` and `unhandledrejection` listeners. Call
 * once, before `bootstrapApplication()`, so the recovery is armed for
 * the very first lazy import (preload kicks in immediately after the
 * initial NavigationEnd).
 *
 * Returns a teardown function that removes the listeners and clears
 * the verification timer — useful in tests so each spec starts from a
 * clean slate. Production callers can ignore the return value.
 */
export function setupStaleChunkRecovery(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  // In-memory single-shot guard. Survives the same JS session even if
  // sessionStorage is unavailable; combined with the sessionStorage flag
  // it gives us two-layer protection (see file docblock).
  let attemptedThisSession = false;

  function reloadOnce(reason: string): void {
    if (attemptedThisSession) {
      console.error(
        `[stale-chunk-recovery] already attempted this session — not reloading. Reason: ${reason}`,
      );
      return;
    }
    try {
      if (sessionStorage.getItem(RELOAD_FLAG_KEY)) {
        console.error(
          `[stale-chunk-recovery] reload already attempted in a previous boot — not reloading. Reason: ${reason}`,
        );
        attemptedThisSession = true;
        return;
      }
      sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
    } catch {
      // sessionStorage threw (private mode / quota / locked origin). With
      // no persistent state we can't track across the reload boundary, so
      // a reload could loop if the failure recurs. Refuse to reload —
      // the user sees the original error and can hard-refresh manually.
      console.error(
        `[stale-chunk-recovery] sessionStorage unavailable — not reloading (would risk an infinite reload loop). Reason: ${reason}`,
      );
      return;
    }
    attemptedThisSession = true;
    console.warn(
      `[stale-chunk-recovery] stale-chunk failure detected (${reason}); reloading to pick up the current bundle.`,
    );
    window.location.reload();
  }

  const errorHandler = (event: ErrorEvent) => {
    const message = messageOf(event.error) || event.message || '';
    if (looksLikeStaleChunk(message)) reloadOnce(message);
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const message = messageOf(event.reason);
    if (looksLikeStaleChunk(message)) reloadOnce(message);
  };

  // Capture phase: synchronous module/script load errors fire on the
  // `<script>` element and do NOT bubble to `window`. Capturing
  // intercepts them on the way down, before they reach the target.
  // Without `capture: true`, browsers that surface stale-chunk failures
  // synchronously (rather than as a rejected import promise) would
  // skip this listener entirely.
  window.addEventListener('error', errorHandler, { capture: true });
  window.addEventListener('unhandledrejection', rejectionHandler);

  // After the SPA has run for `RECOVERY_VERIFIED_AFTER_MS` without
  // crashing, clear the cross-reload flag. Without this, the first
  // successful recovery in a long-lived session would consume the
  // single-shot guard, and a *later* deploy mismatch (hours later)
  // would log "already attempted" and refuse to self-heal.
  const verifiedTimer = window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG_KEY);
    } catch {
      // sessionStorage broken — same fallback as in reloadOnce. Nothing
      // to do; we can't manage a flag we can't write.
    }
  }, RECOVERY_VERIFIED_AFTER_MS);

  return () => {
    window.removeEventListener('error', errorHandler, { capture: true });
    window.removeEventListener('unhandledrejection', rejectionHandler);
    window.clearTimeout(verifiedTimer);
  };
}
