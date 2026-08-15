# Budojo Desktop

Electron shell for Budojo (M11, #1218): serves the Angular build over a custom
`app://` scheme and runs the Laravel API on a bundled PHP runtime — no Docker,
no MySQL, one process on one machine.

## Development

```bash
cd desktop
npm install
npm run fetch:php     # once: downloads + sha256-verifies PHP 8.4 into runtime/php
npm run dev           # builds, then opens the window against ng serve on :4200
```

`npm run dev` starts the supervised PHP runtime every time — the API you get is
the bundled one, on a free loopback port, with its data under
`%APPDATA%\Budojo-dev` (never the real `Budojo` directory a packaged build uses).
Logs: `%APPDATA%\Budojo-dev\logs\`.

`npm test` runs the Vitest specs, `npm run lint` typechecks.

## Layout

| Path | What |
|---|---|
| `src/main.ts` | Wiring: scheme, window, single-instance lock, boot order |
| `src/protocol.ts` | `app://` routing — asset misses 404, navigations get the shell (#382) |
| `src/php-runtime.ts` | Pure helpers: paths, php.ini, child env whitelist, serve invocation, restart budget |
| `src/php-supervisor.ts` | Spawns/probes/restarts/stops the PHP built-in server |
| `src/preload.cts` | The whole renderer bridge: `window.__BUDOJO__.apiBase` |
| `runtime/php.manifest.json` | Pinned PHP version + sha256; `scripts/fetch-php.mjs` reproduces `runtime/php/` from it |
| `electron-builder.yml` | Packaging layout; installer CI is #1231 |

Architecture, install and recovery docs land in `docs/desktop/` (#1232).

## Data directory

Everything that persists lives under `app.getPath('userData')` — `%APPDATA%\Budojo`
(packaged) or `%APPDATA%\Budojo-dev` (development). Never beside the executable.

```
Budojo/
├── budojo.sqlite          the database (WAL mode)
├── storage/               Laravel's storage/, relocated via LARAVEL_STORAGE_PATH
│   ├── app/private/documents/*.enc   uploaded documents, encrypted at rest
│   └── logs/laravel.log
├── logs/                  php-server.log (rotated), php-error.log, bootstrap.log
├── backups/               pre-migration-*.sqlite snapshots, taken before any upgrade
├── secrets.bin            APP_KEY + DOCUMENT_ENCRYPTION_KEY, encrypted with the OS keychain (DPAPI)
├── bootstrap.json         first run / last migration bookkeeping
├── php.ini                generated at every launch
└── php-server.pid
```

`secrets.bin` is bound to the Windows user profile that created it. A backup that
does not include it — or is restored on another profile — cannot decrypt the
documents. This is the one recovery scenario that fails silently; #1232 writes it
down.
