# Budojo

> BJJ gym management — replace the Excel sheets with something built for the mat.

Budojo helps Brazilian Jiu-Jitsu instructors track students, documents, attendance, payments and belt progressions without the usual spreadsheet mess.

It ships as a **Windows desktop application**: the same Angular SPA and Laravel API that ran as a hosted web app, packaged with Electron and a bundled PHP runtime so the whole thing runs on the instructor's own machine — no server, no account, no monthly bill. The hosted stack (DigitalOcean / Forge / Cloudflare) was decommissioned in [#1230](https://github.com/Budojo/budojo/issues/1230); its runbook is kept, archived, at [`docs/infra/archive/production-deployment.md`](docs/infra/archive/production-deployment.md).

**Jump to:** [Install](#download--install) · [What it does](#what-it-does) · [How it works](#how-it-works) · [Get started developing](#get-started-developing) · [All make commands](#all-make-commands) · [Common tasks](#common-tasks) · [Structure](#project-structure) · [Roadmap](#roadmap)

---

## Download & install

Grab the latest **[release](https://github.com/Budojo/budojo/releases)** and run **`Budojo-Setup-X.Y.Z.exe`** — per-user, no administrator prompt, upgrades in place, updates itself, and opens in a couple of seconds. (The `latest.yml` and `.blockmap` beside it are how an installed copy finds updates; you don't download those.)

There was also a portable build until [#1272](https://github.com/Budojo/budojo/issues/1272) — it re-extracted ~450 MB on *every* launch and took about two minutes to open, so it was removed. If you have one, install over it; your data lives in `%APPDATA%\Budojo\`, not in the exe.

It is unsigned, so Windows SmartScreen warns on first run — **More info → Run anyway**. Full walkthrough (first run, upgrades, why the warning) in **[`docs/desktop/install.md`](docs/desktop/install.md)**.

> **Back up your data — and read how the encryption keys work.** A backup protects your athletes, attendance and payments anywhere, but the medical certificates are encrypted with a machine-bound key that a backup does not contain. Since v2.42.0 you can export that key as a recovery code — do it once, today. This matters the day a laptop dies: **[`docs/desktop/backup-restore.md`](docs/desktop/backup-restore.md)**.

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
| **Backup & restore** | Scheduled + on-demand local backups, validated restore ([#1228](https://github.com/Budojo/budojo/issues/1228)), plus recovery-key export for a new machine ([#1254](https://github.com/Budojo/budojo/issues/1254)) |

**Disabled by design on desktop.** Budojo's runtime profile is a *set of capabilities*, and the desktop set is empty ([architecture § Capabilities](docs/desktop/architecture.md#runtime-profile-and-capabilities)): community feeds, athlete self-service logins, browser push, outbound email/SMTP, and the HaveIBeenPwned breach check are all off — there is no second user, mail transport or push service on a single-owner local install. The code is not deleted; the config simply doesn't enable it.

---

## How it works

Three pieces, one process tree:

```
Electron main  ──spawns──▶  php.exe  ──▶  SQLite  (%APPDATA%\Budojo\budojo.sqlite)
      │                    (Laravel API on 127.0.0.1:<ephemeral port>)
      │                              ▲
      └─ serves ──▶  Angular SPA ────┘  HTTP /api/v1
                     over app://bundle
```

- **`server/`** — the Laravel 13 API. Identical code to the hosted build; what changes is the **runtime profile** (`web` | `desktop`) and the capability set it enables.
- **`client/`** — the Angular 21 SPA. Also identical; it discovers the API's port through the Electron preload bridge (`window.__BUDOJO__`) instead of a hardcoded origin.
- **`desktop/`** — the Electron shell: serves the SPA over a custom `app://bundle` origin, supervises `php.exe`, owns first-run bootstrap (keys in the OS keychain, migrations), the scheduler, native notifications, backups and recovery keys.

Everything the user owns lives under `%APPDATA%\Budojo\` — never beside the executable, so an uninstall cannot take the gym with it. Full process model, IPC surface and data layout: **[`docs/desktop/architecture.md`](docs/desktop/architecture.md)**.

---

## Get started developing

**Prerequisites:** Docker + Docker Compose, Node 22+, and GNU make.

- **Linux** — the development base. Your user needs to be in the `docker` group. Distro-specific notes (file ownership across the bind mount, SELinux, the Cypress recipe) are in [`docs/development/linux-dev.md`](docs/development/linux-dev.md); read it once before the first `make up`.
- **Windows** — also supported. Add Git for Windows: the Makefile resolves its shell through Git Bash, and `make` itself comes from scoop/choco or Git Bash.

```bash
git clone https://github.com/Budojo/budojo.git
cd budojo
make setup     # once per clone — dev tooling + git hooks
make up        # start the API, SPA and Mailpit
make seed      # optional: test data
```

| Service | URL |
|---------|-----|
| Angular SPA | <http://localhost:4200> |
| Laravel API | <http://localhost:8000/api/v1> |
| Mailpit (catches all outbound mail) | <http://localhost:8025> |

There is **no `.env` to copy and no key to generate**. The API container's entrypoint installs Composer dependencies, seeds `server/.env` from `server/.env.example`, generates `APP_KEY`, creates the SQLite database and migrates it. Every step is idempotent, so restarts are no-ops.

`make seed` creates `admin@example.it` with the password in `LOCAL_ADMIN_PASSWORD` (`password` by default), one pre-configured academy, and ~40 athletes with attendance and payment history. To exercise the `/setup` first-login flow you need users *without* an academy. `AcademySeeder` makes eight (five with their own academy, three without) but is not in `DatabaseSeeder`'s list, so run it explicitly:

```bash
docker exec budojo_api php artisan db:seed --class=AcademySeeder
```

**Why `make setup` matters:** it runs `npm ci` at the repo root, which is what installs husky/commitlint/lint-staged **and wires the git hooks**. Without it the hooks silently do not run — conventional commits go unchecked and nothing stops a commit on `main`/`develop`. Verify with `git config core.hooksPath`; it should print `.husky/_`.

> **The app is configured by `server/.env` alone.** `docker-compose.yml` deliberately has **no `env_file`** — Compose would turn it into real environment variables, and Laravel's `env()` resolves `$_SERVER` before `$_ENV`, silently overriding both `server/.env` and `phpunit.xml`. See the comment in the compose file for the damage that caused.

`make down` keeps your data; `docker compose down -v` destroys it.

---

## All make commands

`make` with no arguments prints this list from the Makefile itself. Every target works from a **Linux shell** and, on Windows, from **Git Bash and PowerShell** — each one delegates to the script, npm command or docker command that already owns the job, so the Makefile adds no logic of its own. The three targets that run or package the desktop app are Windows-only until [#1300](https://github.com/Budojo/budojo/issues/1300) lands — `make desktop-build` compiles fine anywhere.

### Setup

| Command | What it does |
|---|---|
| `make help` | Show this list |
| `make setup` | Install the root dev tooling and wire the git hooks (run once per clone) |

### Dev environment

| Command | What it does |
|---|---|
| `make up` | Start the dev environment (API, SPA, Mailpit) |
| `make down` | Stop the dev environment (keeps your data) |
| `make restart` | Restart the dev environment |
| `make logs` | Tail the API + client logs |
| `make seed` | Seed the dev database with test data |
| `make db` | Open a sqlite shell on the dev database |
| `make mail` | Open Mailpit in the browser |

### Gates (run before every push)

| Command | What it does |
|---|---|
| `make test` | Run every pre-push gate |
| `make test-server` | PHP gates: cs-fixer + phpstan + pest |
| `make test-client` | Angular gates: prettier + eslint + vitest |
| `make test-desktop` | Desktop gates: tsc + vitest |
| `make quick` | Same gates, skipping the `--write` formatters (re-runs mid-session) |
| `make audit` | Security advisories across client, server and desktop (production deps) |

### Desktop build

| Command | What it does |
|---|---|
| `make desktop` | Run the desktop app against the dev SPA (`ng serve` must be up) — Windows only |
| `make desktop-build` | Compile the main process + preload |
| `make desktop-package` | Build the Windows installers into `desktop/release` (Windows only) |
| `make fetch-php` | Download + verify the pinned PHP runtime (Windows only) |
| `make clean` | Remove build output (`desktop/dist`, `desktop/release`, `client/dist`) |

### Workflow

| Command | What it does |
|---|---|
| `make gotchas` | Print the gotchas routing table (read before every push) |
| `make board` | Set a board status, e.g. `make board N=1234 S=in-progress` |
| `make check-readme` | Verify these tables still list exactly the Makefile's targets |

> Cutting a release is **not** a make target. It is an ordered sequence with judgement in it (compute the version, write the changelog, verify the installers actually attached) and lives as the `/release` command — see [`docs/development/release-flow.md`](docs/development/release-flow.md).
>
> This table is generated from the Makefile; if it ever disagrees with `make help`, the Makefile wins. The post-release sweep re-checks it.

---

## Common tasks

**Add or change an API endpoint**
1. Write the failing PEST feature test first.
2. Controller stays thin — business logic goes in an Action under `server/app/Actions/`, validation in a FormRequest, shaping in a Resource.
3. **Update [`docs/api/v1.yaml`](docs/api/v1.yaml) in the same PR** — a route change without a spec change is not done, and CI's Spectral job lints the file.
4. `make test-server`.

**Add a screen or component**
1. Standalone component, `OnPush`, state in signals; HTTP only in a service under `client/src/app/core/services/`.
2. Every visible string goes in `client/public/assets/i18n/{en,it}.json` — **both**, in lock-step; a parity spec fails otherwise.
3. Check [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) before inventing spacing or colour: 8dp grid, theme tokens, mobile-first.
4. `make test-client`, then look at it in a browser at desktop **and** mobile width.

**Change something in the desktop shell**
1. Read [`desktop/CLAUDE.md`](desktop/CLAUDE.md) first — the pure-engine + injected-IO split is the rule that shapes everything there.
2. Never import `electron` outside `main.ts` / `preload.cts`, or the module stops being unit-testable.
3. Adding to the renderer bridge means editing three files in lock-step: `preload.cts`, `main.ts`, `client/src/budojo-bridge.d.ts`.
4. `make test-desktop` — and for anything that spawns a process, prove it with a real-process harness, not just unit tests.

**Change a migration, enum or business rule** → update the matching file under [`docs/entities/`](docs/entities/) in the same PR.

**Before pushing** → `make test`, then `make gotchas` and read the groups your diff touches.

---

## API

The full HTTP contract for `/api/v1` is in **[`docs/api/v1.yaml`](docs/api/v1.yaml)** (OpenAPI 3.0.3). Browse it with Swagger UI / Redocly / Stoplight, or import into Postman / Insomnia.

On desktop the API listens on `http://127.0.0.1:<port>` — an ephemeral loopback port the shell picks at launch and hands to the SPA. In development it's `http://localhost:8000/api/v1`.

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
| **M7 — Athlete login** | 🧊 Frozen — web-only capability, disabled on a single-owner install |
| **M8 — Document AI** | 📋 Planned — LLM parsing of medical/consent scans to pre-fill athlete profiles |
| **M9 — Mobile / Android TWA** | 🧊 **Frozen** |
| **M10 — Mobile (Capacitor / native)** | 🧊 **Frozen** |
| **M11 — Desktop (Electron)** | ✅ Done ([#1218](https://github.com/Budojo/budojo/issues/1218)) — this build |

> **Frozen means parked by decision, not forgotten.** The mobile work depended on a hosted origin serving `/.well-known/assetlinks.json` and a Play Console pipeline; the multi-user work depends on capabilities a single-owner install doesn't enable. Both survive a config flip if a hosted build ever returns — see [`docs/development/pr-labels.md`](docs/development/pr-labels.md) § `🧊 frozen`.

---

## Project structure

```
budojo/
├── Makefile              # one front door for every command below
│
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
│       ├── environments/     # environment.ts (dev), .prod.ts, .desktop.ts (apiBase from the bridge)
│       ├── budojo-bridge.d.ts# Typed window.__BUDOJO__ surface
│       └── app/{core,features,shared}/
│
├── desktop/              # Electron shell (M11) — main + preload + protocol + PHP supervisor
│   ├── src/                  # main.ts, preload.cts, protocol.ts, php-supervisor.ts, bootstrap.ts, backup.ts, …
│   ├── electron-builder.yml  # NSIS packaging; php runtime + server as extraResources
│   ├── runtime/              # php.manifest.json (pinned) — php.exe fetched, not committed
│   └── scripts/              # fetch-php.mjs, build-renderer.mjs
│
├── docs/                 # Domain documentation (source of truth)
│   ├── desktop/              # architecture, install, backup-restore  ← the desktop era
│   ├── development/          # git-flow, release-flow, pr-labels, visual-verification
│   └── entities/  api/v1.yaml  specs/  design/  infra/
│
├── .claude/              # Agent + workflow tooling
│   ├── scripts/              # the gate wrappers the Makefile delegates to
│   ├── commands/             # /release, /prereview, /feedback-digest
│   └── gotchas.md            # mistakes we've made — read before every push
│
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
| Desktop packaging | electron-builder (NSIS) |
| Dev environment | Docker + Compose |
| PHP tests | PEST 4 |
| PHP static analysis | PHPStan (level 9) |
| PHP style | PHP CS Fixer (PSR-12) |
| Angular unit tests | Vitest 4 |
| Angular E2E tests | Cypress 13 |
| Releases | semantic-release (beta on develop, stable on main) |

---

## Conventions

Branch model, commit format, PR rules, release mechanics and the review discipline live in **[CLAUDE.md](./CLAUDE.md)** (behavioural rules) and **[`docs/development/`](docs/development/)** (the runbooks behind them). The short version:

- GitFlow: `main` ← `develop` ← `type/<issue>-<description>`. Never commit or push to `main`/`develop` — the git hooks refuse it.
- Conventional commits, lower-case subject, enforced by commitlint.
- Squash merge into `develop`; merge commit into `main`.
- Docs change in the same PR as the code that invalidates them.
