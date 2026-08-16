# Budojo

> BJJ gym management — replace the Excel sheets with something built for the mat.

Budojo helps Brazilian Jiu-Jitsu instructors track students, documents, attendance, payments and belt progressions without the usual spreadsheet mess.

It ships as a **Windows desktop application**: the same Angular SPA and Laravel API that ran as a hosted web app, packaged with Electron and a bundled PHP runtime so the whole thing runs on the instructor's own machine — no server, no account, no monthly bill. The hosted stack (DigitalOcean / Forge / Cloudflare) was decommissioned in [#1230](https://github.com/Budojo/budojo/issues/1230); its runbook is kept, archived, at [`docs/infra/archive/production-deployment.md`](docs/infra/archive/production-deployment.md).

---

## Download & install

Grab the latest **[release](https://github.com/Budojo/budojo/releases)** — each attaches two Windows builds:

- **`Budojo.Setup.X.Y.Z.exe`** — installer (per-user, no admin, upgradable in place). **Use this one** — it opens in a couple of seconds.
- **`Budojo.X.Y.Z.exe`** — portable, no installation. Be aware it re-extracts ~450 MB on *every* launch, so it takes about two minutes to open ([#1272](https://github.com/Budojo/budojo/issues/1272)).

Both are unsigned, so Windows SmartScreen warns on first run — **More info → Run anyway**. Full walkthrough (first run, upgrades, why the warning) in **[`docs/desktop/install.md`](docs/desktop/install.md)**.

> **Back up your data — and read how the encryption keys work.** A backup protects your athletes, attendance and payments anywhere, but the medical certificates are encrypted with a machine-bound key that a backup does not contain. This matters the day a laptop dies: **[`docs/desktop/backup-restore.md`](docs/desktop/backup-restore.md)**.

---

## What it does

Everything runs locally against a bundled SQLite database. These surfaces ship in the desktop build:

| Area | Details |
|------|---------|
| **Authentication** | Local owner sign-in via Sanctum tokens; auto-login, with the token held in the OS keychain ([#1227](https://github.com/Budojo/budojo/issues/1227)) |
| **Academy setup** | Your gym profile — name, structured address, monthly fee, training-day schedule, logo |
| **Athletes** | Full CRUD, structured phone (libphonenumber-validated) + address, name search, belt / status / paid filters, rank-aware sorting |
| **Documents** | Upload, list, download, soft-delete; cancelled toggle; cross-athlete expiring-list widget with deep-linking. Files encrypted at rest |
| **Attendance** | Daily check-in (optimistic UI + 5s undo); per-athlete calendar history; monthly summary + % rate against the scheduled denominator |
| **Payments** | Per-athlete monthly ledger; "paid" badge + filter; `monthly_fee_cents` snapshotted into each row |
| **Reminders** | Document-expiry checks raise **native OS notifications** ([#1225](https://github.com/Budojo/budojo/issues/1225)) — the desktop replacement for the hosted build's email reminders |
| **Backup & restore** | Scheduled + on-demand local backups, validated restore ([#1228](https://github.com/Budojo/budojo/issues/1228)) — see the runbook above |

**Disabled by design on desktop.** Budojo's runtime profile is a *set of capabilities*, and the desktop set is empty ([architecture § Capabilities](docs/desktop/architecture.md#runtime-profile-and-capabilities)): community feeds, athlete self-service logins, browser push, outbound email/SMTP, and the HaveIBeenPwned breach check are all off — there is no second user, mail transport or push service on a single-owner local install. The code is not deleted; the config simply doesn't enable it.

---

## How it's built

An Electron shell serves the unmodified Angular SPA over a custom `app://bundle` origin and supervises a bundled `php.exe` running the Laravel API on a loopback port, against SQLite under `%APPDATA%\Budojo\`. The full process model, IPC surface, `app://` transport, PHP supervision and data layout are in **[`docs/desktop/architecture.md`](docs/desktop/architecture.md)**.

---

## Development

The shipped app has **no Docker** — but local development runs the API and SPA in containers.

### Prerequisites

- Docker + Docker Compose

```bash
make            # list every target
make setup      # once per clone: dev tooling + git hooks
make up         # start the dev environment
make test       # all pre-push gates
```

`make` is a thin index over the scripts and npm/docker commands that already own each job — `make help` is the current list, so this README never goes stale against it. Every target works from Git Bash and PowerShell.

That is the whole list to *run* it. There is no `.env` to copy and no key to generate — the API container's entrypoint installs Composer dependencies, seeds `server/.env` from `server/.env.example`, generates `APP_KEY`, creates the SQLite database and migrates it. Every step is idempotent, so restarts are no-ops.

If you're going to **commit**, run `npm ci` at the repo root once as well. That installs the dev tooling (husky, commitlint, lint-staged) and wires the git hooks that enforce conventional commits and refuse commits/pushes on `main` and `develop`. Check it took with `git config core.hooksPath` — it should print `.husky/_`.

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Angular SPA | http://localhost:4200 |
| Laravel API | http://localhost:8000/api/v1 |
| Mailpit (catches all outbound mail) | http://localhost:8025 |

The database is **SQLite**, matching the desktop runtime. It lives on the `sqlite_data` named volume rather than the bind mount, because Docker Desktop's host filesystem share does not implement POSIX advisory locking faithfully and SQLite depends on it. Inspect it with:

```bash
docker exec -it budojo_api sqlite3 /var/www/api/database/sqlite/budojo.sqlite
```

`docker compose down` keeps your data; `docker compose down -v` destroys it.

> **The app is configured by `server/.env` only.** The compose file deliberately has no `env_file` — see the comment in `docker-compose.yml` for the bug that caused.

### Seed test data

```bash
docker exec budojo_api php artisan db:seed
```

This creates `admin@example.it` / `LOCAL_ADMIN_PASSWORD` (`password` by default) with a pre-configured academy, 5 users each with their own academy, and 3 users without one (to exercise the `/setup` first-login flow).

### Building the desktop app

The desktop build lives under [`desktop/`](desktop/). To produce the Windows installers locally (on Windows):

```bash
cd client && npm ci && cd ..
cd desktop && npm ci
npm run dist          # tsc + ng build --configuration desktop + fetch PHP + electron-builder (NSIS + portable)
```

Output lands in `desktop/release/`. In CI the `desktop-installer` job builds and attaches them to each stable release ([#1231](https://github.com/Budojo/budojo/issues/1231)). See [`docs/desktop/`](docs/desktop/) for the full picture.

---

## API

The full HTTP contract for `/api/v1` is in **[`docs/api/v1.yaml`](docs/api/v1.yaml)** (OpenAPI 3.0.3). Browse it with Swagger UI / Redocly / Stoplight, or import into Postman / Insomnia.

On desktop the API listens on `http://127.0.0.1:<port>` (an ephemeral loopback port the shell picks and hands the SPA). In development it's `http://localhost:8000/api/v1`.

A Postman collection lives at [`postman/budojo.postman_collection.json`](postman/budojo.postman_collection.json). Per-entity domain reference (schema, business rules, endpoints) lives under [`docs/entities/`](docs/entities/) — one file per persisted entity.

---

## Roadmap

| Milestone | Status |
|---|---|
| **M1 — Authentication** | ✅ Done |
| **M2 — Academy & Athletes** | ✅ Done |
| **M3 — Documents & Deadlines** | ✅ Done ([PRD](docs/specs/m3-documents.md)) |
| **M4 — Attendance** (+ Payments) | ✅ Done ([PRD](docs/specs/m4-attendance.md)) |
| **M5 — Notifications** | ✅ On desktop as **native OS reminders**; hosted email reminders retired with the stack |
| **M6 — Promotions & reports** | 📋 Planned — belt promotion history, attendance reports, exports |
| **M7 — Athlete login** | 🌐 Web-only capability — invite-only athlete self-service. Present in code, **disabled on desktop** (single-owner install) |
| **M8 — Document AI** | 📋 Planned — LLM parsing of medical/consent scans to pre-fill athlete profiles |
| **M9 — Mobile / Android TWA** | 🧊 **Frozen** |
| **M10 — Mobile (Capacitor / native)** | 🧊 **Frozen** |
| **M11 — Desktop (Electron)** | ✅ Done ([#1218](https://github.com/Budojo/budojo/issues/1218)) — this build |

> **M9 / M10 are frozen by decision, not oversight.** The mobile work (Android TWA, native shells) depended on a hosted origin serving `/.well-known/assetlinks.json` and a Play Console pipeline. When the hosted stack was decommissioned for cost (M11), the mobile track lost its foundation and was intentionally parked. The PWA-readiness work remains in the history ([`docs/mobile/`](docs/mobile/)); reviving it is a future decision, not pending work.

---

## Project structure

```
budojo/
├── server/               # Laravel 13 REST API (PHP 8.4) — shipped bundled on desktop
│   └── app/
│       ├── Actions/          # Single-responsibility business operations
│       ├── Enums/            # Belt, AthleteStatus, RuntimeProfile, Capability, …
│       ├── Http/{Controllers,Requests,Resources,Middleware}/
│       ├── Models/  Observers/  Support/   # Runtime, Capabilities, DesktopDriverGuard, …
│       └── Console/Schedules/  # Web vs Desktop schedule definitions
│
├── client/               # Angular 21 SPA (PrimeNG 21, MD3)
│   └── src/
│       ├── environments/     # environment.ts (dev), .prod.ts (empty apiBase), .desktop.ts (apiBase from the Electron bridge)
│       ├── budojo-bridge.d.ts# Typed window.__BUDOJO__ surface
│       └── app/{core,features,shared}/
│
├── desktop/              # Electron shell (M11) — main + preload + protocol + PHP supervisor
│   ├── src/                  # main.ts, preload.cts, protocol.ts, php-supervisor.ts, bootstrap.ts, backup.ts, …
│   ├── electron-builder.yml  # NSIS + portable packaging; php runtime + server as extraResources
│   ├── runtime/              # php.manifest.json (pinned) — php.exe fetched, not committed
│   └── scripts/              # fetch-php.mjs, build-renderer.mjs
│
├── docs/                 # Domain documentation (source of truth)
│   ├── desktop/              # architecture, install, backup-restore  ← the desktop era
│   ├── entities/  api/v1.yaml  specs/  development/  design/  infra/
├── docker/               # Dockerfiles + configs (dev only)
├── postman/
└── docker-compose.yml    # dev environment only — the desktop app bundles its own runtime
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API framework | Laravel 13 (PHP 8.4) |
| Auth | Laravel Sanctum (Bearer tokens) |
| Database | SQLite (WAL) — dev and desktop alike |
| SPA framework | Angular 21 |
| UI components | PrimeNG 21 (Material preset, MD3) |
| API contract | OpenAPI 3.0.3 + Spectral lint |
| Desktop shell | Electron 33 + bundled PHP 8.4 |
| Desktop packaging | electron-builder (NSIS + portable) |
| Dev environment | Docker + Compose |
| PHP tests | PEST 4 |
| PHP static analysis | PHPStan (level 9) |
| PHP style | PHP CS Fixer (PSR-12) |
| Angular unit tests | Vitest 4 |
| Angular E2E tests | Cypress 13 |
| Releases | semantic-release (beta on develop, stable on main) |

---

## Development conventions

For branching model, commit conventions, PR rules and CI pipeline details see **[CLAUDE.md](./CLAUDE.md)**.
