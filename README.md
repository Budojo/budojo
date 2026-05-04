# Budojo

> BJJ gym management — replace the Excel sheets with something built for the mat.

Budojo is a web application for Brazilian Jiu-Jitsu instructors. It replaces the typical mess of spreadsheets used to track students, documents, attendance and belt progressions with a clean, purpose-built tool.

---

## Production

| Component | URL |
|-----------|-----|
| Angular SPA | <https://budojo.it> |
| Laravel API | <https://api.budojo.it> |
| API health | <https://api.budojo.it/api/v1/health> |

Architecture, deploy flow, env vars, runbook and gotchas: **[`docs/infra/production-deployment.md`](docs/infra/production-deployment.md)**.

---

## What's live right now

| Area | Status | Details |
|------|--------|---------|
| **Authentication** | ✅ Live | Register, login, logout via Sanctum Bearer tokens |
| **Academy setup** | ✅ Live | Create your gym profile — name, structured polymorphic address, monthly fee, training-day schedule, logo upload |
| **Athletes** | ✅ Live | Full CRUD with structured phone (libphonenumber-validated), structured polymorphic address, server-side name search, belt / status / paid filters, rank-aware sorting |
| **Documents (M3)** | ✅ Live | Upload, list, download, soft-delete; cancelled toggle; reactive-form upload dialog; cross-athlete expiring-list dashboard widget with deep-linking |
| **Attendance (M4)** | ✅ Live | Daily check-in (mobile-first, optimistic UI + 5s undo toast); per-athlete calendar history; monthly summary widget + full table; training-days % rate against scheduled denominator |
| **Payments** | ✅ Live | Per-athlete monthly payment ledger; "paid" badge on athletes list; idempotent record/delete; `monthly_fee_cents` snapshotted into payment rows |
| **Notifications (M5)** | 📋 Planned | Email reminders before document expiry, configurable lead time |
| **Promotions & reports (M6)** | 📋 Planned | Belt promotion history, attendance reports, exports, analytics |

---

## Running locally

### Prerequisites

- Docker + Docker Compose
- A `.env` file at the repo root (copy `.env.example` and fill in the values)

```bash
cp .env.example .env   # fill in DB_ROOT_PASSWORD, DB_PASSWORD, LOCAL_ADMIN_PASSWORD, etc.
docker compose up --build
docker exec budojo_api php artisan key:generate   # generates APP_KEY on first run
```

| Service | URL |
|---------|-----|
| Angular SPA | http://localhost:4200 |
| Laravel API | http://localhost:8000/api/v1 |
| MySQL | localhost:3306 |

Database migrations run automatically on API container start.

### Seed test data

```bash
docker exec budojo_api php artisan db:seed
```

This creates:
- `admin@example.it` / `<LOCAL_ADMIN_PASSWORD>` — admin user with a pre-configured academy (no athletes seeded for this account)
- 5 additional users each with their own academy
- 3 additional users without an academy (to exercise the `/setup` first-login flow)

---

## SPA pages

All pages are served at **http://localhost:4200**.

| URL | Access | Description |
|-----|--------|-------------|
| `/auth/register` | Public | Create a new account |
| `/auth/login` | Public | Sign in |
| `/setup` | Auth, no academy yet | First-time academy setup — enter gym name and address |
| `/dashboard` | Auth + academy | Redirects to `/dashboard/athletes` |
| `/dashboard/athletes` | Auth + academy | Paginated athlete roster with belt/status filters and delete |

### Navigation flow

```
/auth/register  ──► /auth/login
                          │
                          ▼
                    has academy?
                   /           \
                 No             Yes
                  │               │
                  ▼               ▼
              /setup      /dashboard/athletes
                  │
                  ▼
          /dashboard/athletes
```

Guards enforce this automatically — no manual redirects needed.

---

## API

The full HTTP contract for `/api/v1` is in **[`docs/api/v1.yaml`](docs/api/v1.yaml)** (OpenAPI 3.0.3). Browse it with Swagger UI / Redocly / Stoplight, or import into Postman / Insomnia.

In production: <https://api.budojo.it/api/v1>. Locally: <http://localhost:8000/api/v1>.

A Postman collection lives at [`postman/budojo.postman_collection.json`](postman/budojo.postman_collection.json) — pre-request script auto-saves the Bearer token after login.

Per-entity domain reference (schema, business rules, related endpoints) lives under [`docs/entities/`](docs/entities/) — one file per persisted entity.

---

## Roadmap

### M1 — Authentication ✅ Done
Register, login, logout via Sanctum Bearer tokens. Angular login/register pages.

### M2 — Academy & Athletes ✅ Done
- Academy: create, retrieve, update (API + Angular setup page) with structured polymorphic address (#72), monthly fee, training-day schedule, logo upload + sanitization.
- Athletes: full CRUD API, list UI with belt / status / paid filters, server-side name search, rank-aware sort, pagination, soft-delete. Structured phone (libphonenumber-validated) and structured polymorphic address (#72b).

### M3 — Documents & Deadlines ✅ Done
- Documents: full CRUD API (upload, list, download, soft-delete), Angular list UI with cancelled toggle, reactive-form upload dialog, cross-athlete expiring list.
- Dashboard widget surfaces documents expiring in the next 30 days with a deep-link to the filtered list.
- See [`docs/specs/m3-documents.md`](docs/specs/m3-documents.md) for the PRD.

### M4 — Attendance ✅ Done
- Daily check-in UI (mobile-first, optimistic UI, 5s undo toast). Per-athlete calendar history with training-days highlight. Monthly summary widget + full table. Training-days % attendance rate against the scheduled denominator.
- See [`docs/specs/m4-attendance.md`](docs/specs/m4-attendance.md) for the PRD (status: Shipped, with the `Deltas from spec` section recording the swipe-gesture deferral).

### Payments ✅ Done (folded into the M4 surface)
- Per-athlete monthly payment ledger; "paid" badge + filter on the athletes list; idempotent record / hard-delete via `/api/v1/athletes/{id}/payments`. The academy's `monthly_fee_cents` is snapshotted into each payment row so future fee changes don't rewrite history.

### M5 — Notifications 📋 Planned
Automated email reminders before documents expire. Configurable lead time per academy.

### M6 — Promotions & Reports 📋 Planned
Belt promotion history, attendance reports, PDF/Excel export, analytics dashboard.

---

## Project structure

```
budojo/
├── server/               # Laravel 13 REST API
│   ├── app/
│   │   ├── Actions/          # Single-responsibility business operations (one execute() per class)
│   │   ├── Contracts/        # Marker interfaces (HasAddress, …)
│   │   ├── Enums/            # Belt, AthleteStatus, Country, ItalianProvince, DocumentType, …
│   │   ├── Http/
│   │   │   ├── Controllers/  # Thin — delegate to Actions
│   │   │   ├── Requests/     # All input validation (FormRequest)
│   │   │   └── Resources/    # All API response shaping
│   │   ├── Models/           # Eloquent models — relations + casts only, no business logic
│   │   ├── Observers/        # Eloquent event handlers (cascade cleanup, etc.)
│   │   └── Support/          # Pure helpers (e.g. CorsAllowlist)
│   ├── config/cors.php       # Production CORS allowlist (env-driven)
│   ├── database/
│   │   ├── factories/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── routes/api_v1.php     # All v1 routes
│   └── tests/{Unit,Feature}/ # PEST 4 — Feature for HTTP round-trips, Unit for pure helpers
│
├── client/               # Angular 21 SPA
│   ├── src/environments/     # apiBase per build configuration (dev = relative, prod = https://api.budojo.it)
│   └── src/app/
│       ├── core/
│       │   ├── guards/       # authGuard, hasAcademyGuard, noAcademyGuard
│       │   ├── interceptors/ # authInterceptor (Bearer token on every request)
│       │   └── services/     # auth, academy, athlete, attendance, document
│       ├── features/
│       │   ├── auth/         # Login, Register
│       │   ├── academy/      # Setup, Detail, Form
│       │   ├── athletes/     # List, Form, Detail (+ attendance-history & documents-list tabs)
│       │   ├── attendance/   # Daily check-in + Monthly summary
│       │   ├── documents/    # Expiring list
│       │   └── dashboard/    # Shell (sidebar + router-outlet)
│       └── shared/
│           ├── components/   # BeltBadge, ExpiryStatusBadge, PaidBadge, TrainingDaysPicker, MonthlySummaryWidget, …
│           └── utils/        # attendance-rate, address-form
│
├── worker/               # Cloudflare Worker fronting the static-asset binding
│   ├── index.js              # Navigation-gated SPA fallback (closes #382)
│   ├── index.spec.js         # Vitest specs covering asset / navigation / non-navigation cases
│   └── package.json          # Vitest dep; runs in CI via the "🧪 Worker Tests" job
├── wrangler.jsonc        # Cloudflare config — `assets` binding + worker `main`
├── docs/                 # Domain documentation (entities, OpenAPI spec, infra, milestone PRDs)
├── docker/               # Dockerfiles + Nginx configs
├── postman/              # Postman collection
└── docker-compose.yml
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API framework | Laravel 13 (PHP 8.4) |
| Auth | Laravel Sanctum (Bearer tokens) |
| Database | MySQL 8.4 |
| SPA framework | Angular 21 |
| UI components | PrimeNG 21 (Material preset, MD3) |
| API contract | OpenAPI 3.0.3 + Spectral lint |
| Containerization | Docker + Compose (local dev) |
| Production hosting — API | DigitalOcean droplet via Laravel Forge |
| Production hosting — SPA | Cloudflare Pages |
| Production CDN / DNS | Cloudflare |
| PHP tests | PEST 4 |
| PHP static analysis | PHPStan (level 9) |
| PHP style | PHP CS Fixer (PSR-12) |
| Angular unit tests | Vitest 4 |
| Angular E2E tests | Cypress 13 |
| Releases | semantic-release (automated, beta on develop, stable on main) |

---

## Development

For branching model, commit conventions, PR rules and CI pipeline details see **[CLAUDE.md](./CLAUDE.md)**.
