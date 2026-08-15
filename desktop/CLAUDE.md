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
- **Never hardcode Windows path separators in a spec.** The app runs on Windows, but CI runs these specs on **Linux** — and `path.dirname('C:\\data\\php.ini')` is `'.'` on POSIX, so a hardcoded literal passes locally and fails in CI. Build the input with `path.join(...)` the way `dataLayout()` does; `join` + `dirname` round-trips to the same directory under both platform semantics.
- **Nothing writes beside the executable.** All state lives under `userData` via `dataLayout()`; the install directory is read-only after install and an uninstall must not be able to take the owner's data with it.

## Testing

```bash
../.claude/scripts/test-desktop.sh   # both gates, from anywhere in the repo
npm run lint                         # tsc -p tsconfig.json --noEmit
npm test                             # vitest run
```

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
