/**
 * Where the SPA is running (M11, #1224) — the client-side twin of the server's
 * `RuntimeProfile` enum.
 *
 *  - web     — served by a web host; service worker, version-check poll and
 *              Web Push are all real.
 *  - desktop — inside the Electron shell over `app://`; the API base comes from
 *              the preload bridge at runtime, and there is no service worker,
 *              no `/version.json` endpoint and no browser push service.
 *
 * Decided at build time via `fileReplacements` because everything it gates is
 * a build artefact (is `ngsw-worker.js` emitted?) or an endpoint that exists
 * or not. Feature *visibility* on the desktop is a runtime capability list
 * from the server (#1229), not this flag — a build target that sprouts
 * `if (desktop)` in components is a fork.
 */
export type ClientRuntime = 'web' | 'desktop';
