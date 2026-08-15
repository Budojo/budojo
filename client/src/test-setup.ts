import { afterEach } from 'vitest';

/**
 * Global unit-test isolation (wired via `test.options.setupFiles` in
 * `angular.json`, run once per Vitest worker after the Angular TestBed is
 * initialised).
 *
 * Several specs drive a successful auth flow — login, reset-password,
 * email-change, athlete-invite, API-token minting — which persists the
 * returned Sanctum token through `AuthService` → `TokenStorageService.set()`,
 * i.e. `localStorage['auth_token']` on the web. None of those specs owns the
 * key, so without a shared reset the value leaks across every spec that runs
 * later in the same worker. That surfaced as an order-dependent failure in
 * `TokenStorageService`'s "web (no bridge)" test, whose first assertion is
 * `expect(store.get()).toBeNull()` — green in isolation, red once a login spec
 * ran before it.
 *
 * Clearing `localStorage` after every test makes each spec hermetic with
 * respect to persisted web storage (F.I.R.S.T. — tests are Independent) and
 * removes the class of bug rather than patching each polluting spec. Only
 * `localStorage` is cleared: `sessionStorage` is managed per-spec where it
 * matters (`stale-chunk-recovery` redefines it to throw inside one test), so a
 * blanket `sessionStorage.clear()` here would be both unnecessary and risky.
 */
afterEach(() => {
  localStorage.clear();
});
