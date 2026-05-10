## What

Add a service-worker-independent cache-bust layer on top of the existing `AppUpdateService` so users stuck on stale bundles (the "Luigi case" — beta tester reported still on v1.8.0 long after several stable releases) get freed without manual cache clearing.

Closes #548.

## Why

`AppUpdateService` (#305 + #398) listens to `SwUpdate.versionUpdates` and reloads on `VERSION_READY`. That works when the SW is healthy AND the listener itself is in the running bundle. It does NOT cover:

- **Pre-#305 bundles** — the auto-update logic itself ships inside the SPA bundle. A user on an old tab pinned to home screen never sees the listener until they reload manually. Catch-22.
- **Suspended iOS PWAs** — `setInterval(checkForUpdate, 1h)` doesn't fire when iOS Safari has paused the standalone tab. Luigi's exact failure mode.
- **SW corruption beyond what the unrecoverable handler can recover from**.

This PR adds a **second barrier** that doesn't depend on the Angular SW at all.

## How

### Build-time identity (`scripts/write-version.cjs`)

`write-version.cjs` already emits `src/environments/version.ts` with `VERSION.tag` for the sidebar footer. Extended to ALSO emit:

- `public/version.json` — copied verbatim into `dist/client/browser/` by the Angular builder; served at `/version.json` with no-cache headers.
- New `VERSION.sha` (full 40-char commit SHA) and `VERSION.buildTime` fields on the embedded version, used as the runtime cache-bust identity.

Both files are committed with sentinel `dev` defaults so `ng serve` and a fresh clone keep working without running the build script.

### Runtime poll (`VersionCheckService`)

Sibling to `AppUpdateService`, wired from `App.ngOnInit`. On three triggers — boot, `window.focus`, and a 20-minute interval — fetch `/version.json` with a cache-bust query param. On SHA mismatch with `VERSION.sha`:

1. `navigator.serviceWorker.getRegistrations()` → `r.unregister()` for every active SW
2. `caches.keys()` → `caches.delete(...)` for every Cache Storage entry
3. `location.reload()`

After the reload, the next request hits the network with no SW or HTTP cache between — the user lands on the latest bundle.

Complete no-op when `VERSION.sha === 'dev'` (the sentinel committed in `environments/version.ts`) so dev mode is unaffected.

### One-shot escape hatch (`?force-update=1`)

Boot-time handler that runs the same nuclear sequence regardless of `/version.json`. Strips the flag from the URL via `history.replaceState` so the reload doesn't re-fire it in a loop.

Operators can hand the URL to a stuck user (`https://budojo.it/?force-update=1`); a single visit unregisters their SW, clears every cache, reloads. Works even when the running bundle's HTTP layer is corrupted — `nuke()` only depends on `navigator.serviceWorker`, `caches`, and `location.reload`.

### Worker (`worker/index.js`)

`/version.json` added to `NO_CACHE_PATHS`. The Worker stamps `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma` + `Expires` on every response for these paths. Existing entries (`/index.html`, `/ngsw.json`, `/ngsw-worker.js`, `/safety-worker.js`) already had this treatment from #398; `/version.json` joins them.

## Notes

- **`AppUpdateService` is unchanged.** The new service is a second barrier, not a replacement. Either one triggering a reload is the right outcome.
- **Mid-form data loss trade-off** — same as `AppUpdateService`: a reload mid-form-fill loses the user's typed data. Forms in this SPA are short (athlete create/edit, academy edit); the worst case is re-keying a couple of fields. If a long-form surface ever lands, gate the reload on Router events.
- **No backend changes.** `version.json` is built client-side; the server doesn't know what version a given client is running.

## Out of scope

- Switching `ngsw-config.json` app-shell from `prefetch` to `freshness` — considered, decided against. The win is marginal and the existing #398 no-cache treatment of `ngsw.json` already lets the SW see new versions promptly. The new `VersionCheckService` is the load-bearing fix.

## Test plan

- [x] Vitest 720 tests pass (7 new in `version-check.service.spec.ts`)
- [x] Worker spec 28 tests pass (5th `NO_CACHE_PATH` covers `/version.json`)
- [x] Lint + Prettier clean
- [ ] Manual smoke after deploy: visit `/?force-update=1` on a tab pinned to old bundle, confirm the SW unregisters + cache clears + reload picks up the latest
- [ ] Manual smoke: deploy a follow-up build, leave a tab focused; within ~20 min the periodic poll detects the SHA mismatch and reloads
