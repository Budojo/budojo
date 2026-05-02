## What

Wires the SPA so a new release on `main` auto-applies in the user's browser the moment the Angular Service Worker has the fresh bundle ready, instead of leaving the user stranded on the previous version until they clear the browser cache by hand.

New `AppUpdateService` (`client/src/app/core/services/app-update.service.ts`):

- Subscribes to `SwUpdate.versionUpdates` filtered for `VERSION_READY` → calls `activateUpdate()` then `document.location.reload()`.
- Schedules a 1-hour `setInterval(checkForUpdate, ...)` so long-lived mobile sessions also catch updates (they typically don't navigate enough to trigger a natural SW poll).
- `start()` is idempotent (a second call is a no-op).
- Dev / SSR safe — `swUpdate.isEnabled === false` short-circuits the entire flow.

Wired from `App.ngOnInit` after the existing `LanguageService.bootstrap()` call.

## Why

Beta tester on mobile reported that after the v1.8.0 → v1.9.0 deploy the SPA stayed on the old version until they manually cleared their browser cache. Reproducing today: with `provideServiceWorker(...)` enabled and `ngsw-config.json` declaring `installMode: prefetch` for the app shell, the SW caches `index.html` + `main-<hash>.js` aggressively. Angular SW emits `VERSION_READY` when it detects the new manifest, but nothing in the SPA reacts — so the page never reloads and the user keeps the old bundle until next-session.

This is broken UX for **every** release. High priority.

## How

### `AppUpdateService` (new)

- `start()` is the only public surface. Wires the subscription + interval, both guarded by `swUpdate.isEnabled`.
- On `VERSION_READY`: `activateUpdate().then(reload, swallow)` — the `swallow` branch on rejection is intentional. If activation fails we keep the user on the old version (same as today) instead of crashing the page.
- Periodic check at 1h interval — picked so the staleness window after a deploy is ≤ 60 min for any open tab. Backs the polling off rather than firing per-second; mobile-friendly.
- `destroyRef.onDestroy(...)` clears the interval on app teardown (defensive — App is a singleton, but the discipline matches other core services).

### `App.ngOnInit`

Adds `this.appUpdateService.start()` after `this.languageService.bootstrap()`. Order matters only loosely: language bootstrap is sync first-paint policy; SW update is async background loop. Both safe in dev (early-return on the SW side, idempotent on the i18n side).

### `app.spec.ts`

Adds `{ provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: NEVER } }`. Without this, `inject(SwUpdate)` in `AppUpdateService` would throw NullInjectorError at App construction. The `isEnabled: false` stub mirrors what dev mode does for real, so the existing App spec assertions stay focused on what they care about (component creation + router-outlet rendering).

### `app-update.service.spec.ts` (new)

Six tests, all using a `SwUpdate` stub backed by an RxJS `Subject<VersionEvent>`:

1. No-op when `swUpdate.isEnabled` is false.
2. `VERSION_READY` → `activateUpdate()` called → `reload()` called.
3. Other event types (`VERSION_DETECTED`, `NO_NEW_VERSION_DETECTED`, `VERSION_INSTALLATION_FAILED`) are ignored — only `VERSION_READY` is load-bearing.
4. Periodic `checkForUpdate` ticks at 1h cadence (verified via `vi.advanceTimersByTime`).
5. `start()` idempotent — a second call doesn't double-subscribe and doesn't double-tick the interval.
6. `activateUpdate()` rejection is swallowed — no reload, no thrown error.

`document.location.reload` is stubbed via `Object.defineProperty` on the service's injected `DOCUMENT` reference, so the test runner doesn't actually navigate.

## Trade-offs (documented in the service docstring)

**Reload immediately vs. defer to next NavigationEnd.** I picked immediate reload. Forms in this SPA are short (athlete create/edit, academy edit, register) — worst case a re-key of a couple of fields. The deferred-reload alternative adds Router-event coupling and a "what if the user never navigates?" tail. If a long-form surface (multi-step wizard) ever lands, revisit by gating the reload on `Router.events.NavigationEnd`.

## Tests

- `bash .claude/scripts/test-client.sh` — prettier clean, lint clean, vitest 380 → 386 (5 new specs from `app-update.service.spec.ts` plus the existing App spec staying green with the SwUpdate stub).

## Out of scope

- A toast / snackbar telling the user "we just updated, reloading now". The flicker of the reload IS the signal; adding a toast is more UI for marginal benefit. If users complain about jarring auto-reloads, revisit.
- Per-tab reload coordination (multiple tabs of the same SPA reloading at once). Standard SW behavior already handles this — each tab's SwUpdate fires independently and reload is per-tab. No need to invent cross-tab orchestration.
- Documenting the change in `production-deployment.md`. The SW update flow is already mentioned in the Release flow section there; the addition is purely a client-side UX improvement, no infra implication.

## Test plan

- [x] `bash .claude/scripts/test-client.sh` green end-to-end.
- [ ] Manual smoke after merge: open the SPA on mobile, confirm a subsequent deploy lands without a manual cache clear (this is the literal repro the beta tester reported).
- [ ] Confirm dev mode is unaffected (`npm start` → inspect Application → Service Workers → none registered, no console noise from the service).

## References

- Angular SW docs: [`SwUpdate.versionUpdates`](https://angular.dev/api/service-worker/SwUpdate#versionUpdates).
- Originating report: beta-tester observation on the v1.8.0 → v1.9.0 deploy boundary.
- Related: `ngsw-config.json` (cache strategy that makes this fix necessary), `app.config.ts` line 94 (`provideServiceWorker` registration).
