# Budojo — Desktop CLAUDE.md

Loaded by Claude Code when you (or an agent) work under `desktop/`. **Extends** the root `CLAUDE.md` — read both. Anything here takes precedence for Electron-shell work.

The *what* and *why* of the desktop build live in [`docs/desktop/architecture.md`](../docs/desktop/architecture.md); this file is the *how to write code here*.

## Scope

`desktop/src/**` (main process, preload, engines), `desktop/scripts/**`, `desktop/electron-builder.yml`, `desktop/tsconfig.json`, `desktop/vitest.config.ts`.

---

## The architectural rule that shapes everything

**Pure engine + injected IO adapter.** Every non-trivial capability is split in two:

| Piece | Example | Testable how |
|---|---|---|
| **Engine** — pure decisions, zero IO | `backup.ts` (naming, retention, `checkRestore`), `recovery-keys.ts` (encode/decode), `bootstrap.ts` (`planMigration`, `parseSecrets`), `protocol.ts` (`resolveAppRequest`) | plain Vitest unit tests, no Electron, no filesystem |
| **Adapter** — the IO that engine describes | `backup-io.ts` (VACUUM INTO, zip), `php-exec.ts` (spawn) | exercised by the real-process harness, not mocked to death |

**Never `import { app } from 'electron'` in a module you want unit-tested.** Electron is only importable from `main.ts` (wiring) and `preload.cts`. Everything else takes what it needs as a parameter — that's why `runBootstrap` accepts a `SecretStore` interface instead of reaching for `safeStorage` itself, and why the whole boot path can run in a Node harness with no Electron at all.

A new capability follows the same shape: engine + spec first, adapter second, one `register*Bridge()` in `main.ts` third.

## Hard rules

- **ESM import paths carry the `.js` extension** (`./bootstrap.js`), even from `.ts`. The compiled output is real Node ESM; a missing extension resolves under Vitest/tsc and then fails at runtime. Bit us once — see gotchas.
- **The preload is `.cts` on purpose.** Preload scripts run as CommonJS; with `sandbox: true` an ESM preload is silently not loaded at all. Do not "modernise" it to `.ts`.
- **The renderer's whole surface is `window.__BUDOJO__`.** Adding to it means editing three files in lock-step: `preload.cts` (expose), `main.ts` (`ipcMain` handler), `client/src/budojo-bridge.d.ts` (type). The type's fields are **required**, so every `__BUDOJO__` stub in the client specs must gain the new channel too — that is deliberate, it stops a half-wired bridge shipping.
- **`ipcMain.handle` (async) for everything except the token.** `sendSync` exists only where the renderer must read inline (the HTTP interceptor reading the token). Nothing else is a hot path.
- **The child-process environment is a whitelist, never `...process.env`.** Laravel's `env()` reads `$_SERVER` before `$_ENV`, so an inherited variable silently overrides `.env`. Also: empty `PHP_INI_SCAN_DIR` and never forward `PHPRC` — a machine-wide scoop PHP otherwise contaminates the bundled runtime (`-c` alone does not stop the scan).
- **`php -S` runs with cwd = `public/`.** The framework router does `require getcwd().'/index.php'`; spawning from the server root 500s every request. `buildServeInvocation` pins this and has a spec.
- **Anything periodic goes through `PeriodicTask`** — never a bare `setInterval`. It never overlaps runs, survives a failing tick, and stops cleanly on quit.
- **Never hardcode Windows path separators in a spec.** The app runs on Windows, but CI **and the development machines** run these specs on Linux — and `path.dirname('C:\\data\\php.ini')` is `'.'` on POSIX, so a hardcoded literal passes on a Windows box and fails everywhere else. Build the input with `path.join(...)` the way `dataLayout()` does; `join` + `dirname` round-trips to the same directory under both platform semantics.
- **The shell only *ships* for Windows; you develop it on Linux.** `npm run lint`, `npm test` and `npm run build` all work here — the 114-test suite is green on Linux. `npm run dev`, `npm run fetch:php` and `npm run dist` do **not**: the pinned runtime is a Win32 zip, `resolveDesktopPaths` hardcodes `php.exe`, `backup-io.ts` zips through PowerShell, and `electron-builder.yml` declares no `linux` target. Porting those four is #1300 — until it lands, anything that has to *run* the packaged app needs a Windows machine. Say so in the PR rather than claiming a runtime you could not exercise.
- **A local build shares the real user's data directory.** `userData` is derived from the `appId`/`productName`, not from where the executable sits — so a build you just made, the portable, and the installed release all read and write the *same* `%APPDATA%\Budojo\`. A dev build carrying a half-finished migration would run it against real athletes. Always test a build with an isolated directory:

  ```
  "release/win-unpacked/Budojo.exe" --user-data-dir="C:/temp/budojo-test"
  ```

  Electron honours the flag in the packaged app — verified — and `%APPDATA%\Budojo` stays untouched.
- **Nothing writes beside the executable.** All state lives under `userData` via `dataLayout()`; the install directory is read-only after install and an uninstall must not be able to take the owner's data with it.

## Backup folder (#1320)

The default way backups leave the machine, and the one to reach for first: the owner picks a folder, every backup is copied there, and the sync client they already run does the rest. No account, no API, no token, no network code — and it covers OneDrive, Dropbox, iCloud, the Drive desktop client, a NAS and a USB stick at once.

- **It is the owner's folder.** Never touch a file we did not create; only `budojo-backup-*.zip` is visible to any decision. Retention reuses `planRetention` (#1228, #1330) rather than reimplementing "never delete the newest", and uses the **same `RETENTION` as local** — a copy that survives the dead laptop is worth nothing if it is the shallower one.
- **Copy before prune**, same as everywhere: pruning first can delete the only copy over there and then fail to write its replacement.
- **Copy to `.partial`, then rename.** An interrupted copy under the real name looks like a backup and is not one — precisely what the size check exists to catch, and worth not creating in the first place.
- **Failures are silent**, with the state on the page. Same reasoning as #1301, and the same consequence: the Backup page is the only alarm, so it has to show the last SUCCESS time beside the error.
- The Drive card (#1301) is **hidden** when no OAuth client is configured. Beside a folder that works, a feature that apologises for itself is worse than one that is absent.

## Google Drive backup sync (#1301)

Opt-in, off until the owner connects an account, and **off entirely in a build with no OAuth client**.

- The client comes from `BUDOJO_GOOGLE_CLIENT_ID` / `BUDOJO_GOOGLE_CLIENT_SECRET` at build time, never a literal. Absent them, `driveClientConfig()` returns null, the bridge answers `configured: false`, and the page says the feature is unavailable — rather than offering a Connect button that opens a Google error page.
- **The client secret is not a secret** for an installed app: the binary is on the user's disk. Google documents this for "Desktop app" clients, and it is exactly why the flow uses PKCE — the authorization code is useless without the verifier, which never leaves the process. Do not add ceremony to protect it; do not widen the scope to compensate.
- **Scope stays `drive.file`.** It reaches only files this app created, and it is classed non-sensitive, which keeps the app out of Google's sensitive-scope verification review. Widening to `drive` reads the user's whole Drive and changes that. A spec pins the constant.
- **The refresh token lives in `drive-token.bin`**, its own file at the root of `userData`. Not in `secrets.bin` (which would tie it to the encryption keys), not in `auth-token.bin` (which would tie disconnecting Drive to signing out), and never under `storage/` — a backup archive is the database plus `storage/`, so a token in there would be uploaded to the account it grants access to. A `bootstrap.spec.ts` test pins that path.
- **The recovery code is never uploaded.** The archive excludes the keys on purpose (#1254); archive and keys in one Google account is a single compromised login away from every medical certificate. This is not a default to revisit.
- **Failures are silent by design** — the local backup already succeeded, so nothing is at risk yet. The whole cost lands on the Backup page being honest, which is why `lastSyncAt` survives a failure instead of being overwritten by `lastErrorAt`.
- **Upload before prune, always.** Pruning first can delete the only remote copy and then fail to upload its replacement. `DriveSyncService` has a test that fails if the order is swapped, and remote retention reuses `planRetention` from #1228 rather than reimplementing "never delete the newest".

`drive-io.ts` is deliberately untested: mocking `fetch` and a loopback socket asserts the mocks were called, not that Google accepts the request. It is harness territory, like `php.exe`.

## Retention (#1228, #1330)

`planRetention` is the one function here whose bugs destroy data rather than merely refusing to help, so it is written to be safe against its own caller.

- **One policy, three destinations.** `RETENTION` in `backup.ts` is what local, the backup folder and Drive all use. Deliberate: a remote copy that is shallower than the local one is worth less exactly when it is needed.
- **Two tiers, not a count.** `keepRecent` holds the newest N whatever their date; `keepDays` holds the last archive of each of the most recent N days *present*. A flat count cannot buy depth without buying density, and the archive contains every encrypted document.
- **Counting days present, not calendar days,** is the point — the app only backs up while it runs, so a calendar window silently empties after a fortnight away.
- **The invariants outrank the policy.** Whatever a caller passes, `planRetention` never proposes deleting the newest archive (`keepRecent` is floored at 1, never trusted) and never proposes deleting a file it did not create. Both have their own tests, under a describe block that says so.
- **`isBackupArchive` is strict, and that is load-bearing.** It matches the full `budojo-backup-YYYYMMDD-HHMMSS.zip` shape, not prefix + suffix. The backup folder belongs to the owner and `budojo-backup-keep-1.zip` is a name a person plausibly types: recognised loosely it would be proposed for deletion, and — because a non-numeric third segment sorts *after* every `YYYYMMDD` — a handful of them would occupy the whole recent tier and push the real archives out of it. The generator is pinned to the recogniser by a test; if they drift, nothing is an archive any more.
- Changing the numbers is a one-line change in `RETENTION`; changing the *shape* means the invariant tests must still pass untouched.
- **`prune()` runs on the failure path too.** A run that dies before pruning leaves the directory over the policy, and if a full disk is what killed it, every later run dies identically. Best-effort and swallowed — the caller must see the real error, not one raised while tidying up after it.

## Testing

```bash
../.claude/scripts/test-desktop.sh   # both gates, from anywhere in the repo
npm run lint                         # tsc on BOTH projects: src, then the specs
npm test                             # vitest run
```

- **The specs are a second tsc project.** `tsconfig.json` excludes `*.spec.ts` because `npm run build` emits from it and specs must not reach `dist/`; `tsconfig.spec.json` checks them and emits nothing. `npm run lint` runs both. Without it the specs were unchecked entirely — a spec could pass a `number` where the module wanted an object and stay green until an assertion happened to notice (#1330).
- **Unit (Vitest)**: every engine, exhaustively — including the refusal paths (a malformed manifest, a truncated recovery code, a newer-schema archive). Refusals are the point: they are what stands between a bug and unreadable data.
- **Real-process harness** for anything that touches the actual runtime (PHP boot, backup/restore round-trip, document decryption). Write it as a throwaway `.mjs` against the compiled `dist/`, run it, and report the count in the PR — a green unit suite does not prove `php.exe` started. Do not commit harnesses; the PR body is their record.
- The first boot of the bundled runtime takes ~10–15 s (Defender scans php.exe cold); every later boot is ~1 s. Never tune a readiness timeout against a warm number.

## Packaging

- `npm run dist` = build main + renderer + fetch PHP + electron-builder (NSIS + portable).
- **`package.json` stays at version `0.0.0`** — semantic-release owns versioning; CI injects the real version with `-c.extraMetadata.version`.
- The PHP runtime is **not committed**: `runtime/php.manifest.json` pins version + sha256 and `fetch:php` verifies the download before extracting. Bump the manifest, never hand-drop a binary.
- `extraResources` layout (`resources/php`, `resources/server`) is a **contract** with `resolveDesktopPaths` — changing one means changing both.
- A zero exit code from a packager/extractor does not mean it worked. Verify the artefact exists afterwards; both `fetch-php.mjs` and the installer CI do this explicitly.

## What Claude Should Always Do — desktop-specific

1. **Engine first, with its spec** — then the adapter, then the bridge wiring.
2. **Never import Electron outside `main.ts` / `preload.cts`.**
3. **Add a bridge channel in all three files at once** (preload, main, `budojo-bridge.d.ts`) and update every client `__BUDOJO__` stub.
4. **Prove runtime changes with a real-process harness**, not only unit tests.
5. **Keep `docs/desktop/` in sync** when the process model, data layout, or IPC surface changes.
