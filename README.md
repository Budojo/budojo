# Budojo

> BJJ gym management — replace the Excel sheets with something built for the mat.

Budojo is a web application for Brazilian Jiu-Jitsu instructors. It replaces the typical mess of spreadsheets used to track students, documents, attendance and belt progressions with a clean, purpose-built tool.

---

## What's live right now

| Area | Status | Details |
|------|--------|---------|
| **Authentication** | ✅ Live | Register, login, logout |
| **Academy setup** | ✅ Live | Create your gym profile (name; address optional) |
| **Athletes — API** | ✅ Live | Full CRUD: create, list, update, soft-delete |
| **Athletes — UI** | ✅ Live | Paginated list with belt/status filters and per-row delete |
| **Documents** | 📋 Planned | — |
| **Attendance** | 📋 Planned | — |
| **Notifications** | 📋 Planned | — |
| **Promotions & reports** | 📋 Planned | — |

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

All endpoints are prefixed with `/api/v1` and served at **http://localhost:8000**.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login — returns a Bearer token |

**Register payload:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret",
  "password_confirmation": "secret"
}
```

**Login payload:**
```json
{ "email": "john@example.com", "password": "secret" }
```

**Login response:**
```json
{
  "data": { "id": 1, "name": "John Doe", "email": "john@example.com" },
  "token": "1|abc123..."
}
```

### Authenticated

Add the token to every request:
```
Authorization: Bearer <token>
```

#### Academy

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/academy` | Create your academy (one per user) |
| `GET` | `/academy` | Get your academy |

**Create payload:**
```json
{ "name": "Gracie Barra Lisboa", "address": "Rua Example 123, Lisboa" }
```

**Response:**
```json
{
  "data": {
    "id": 1,
    "name": "Gracie Barra Lisboa",
    "slug": "gracie-barra-lisboa-a3f9kx2b",
    "address": "Rua Example 123, Lisboa"
  }
}
```

#### Athletes

All athlete endpoints return 403 if the authenticated user has no academy.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/athletes` | Paginated list (20/page) |
| `POST` | `/athletes` | Create an athlete |
| `GET` | `/athletes/{id}` | Get one athlete |
| `PUT` | `/athletes/{id}` | Update an athlete (partial — only send fields you want to change) |
| `DELETE` | `/athletes/{id}` | Soft-delete an athlete |

**List query params:**

| Param | Values | Example |
|-------|--------|---------|
| `belt` | `white` `blue` `purple` `brown` `black` | `?belt=blue` |
| `status` | `active` `suspended` `inactive` | `?status=active` |
| `page` | integer | `?page=2` |

**Create / update payload** (all fields optional on update):
```json
{
  "first_name": "Mario",
  "last_name": "Rossi",
  "email": "mario@example.com",
  "phone": "+39 333 123456",
  "date_of_birth": "1990-05-15",
  "belt": "blue",
  "stripes": 2,
  "status": "active",
  "joined_at": "2023-01-10"
}
```

**Athlete response shape:**
```json
{
  "data": {
    "id": 42,
    "first_name": "Mario",
    "last_name": "Rossi",
    "email": "mario@example.com",
    "phone": "+39 333 123456",
    "date_of_birth": "1990-05-15",
    "belt": "blue",
    "stripes": 2,
    "status": "active",
    "joined_at": "2023-01-10",
    "created_at": "2026-04-22T10:00:00+00:00"
  }
}
```

**List response shape:**
```json
{
  "data": [ /* array of athlete objects */ ],
  "links": {
    "first": "http://localhost:8000/api/v1/athletes?page=1",
    "last":  "http://localhost:8000/api/v1/athletes?page=3",
    "prev":  null,
    "next":  "http://localhost:8000/api/v1/athletes?page=2"
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 3,
    "path": "http://localhost:8000/api/v1/athletes",
    "per_page": 20,
    "to": 20,
    "total": 47
  }
}
```

A Postman collection is available at `postman/budojo.postman_collection.json`. It includes a pre-request script that auto-saves the Bearer token after login.

---

## Roadmap

### M1 — Authentication ✅ Done
Register, login, logout via Sanctum Bearer tokens. Angular login/register pages.

### M2 — Academy & Athletes ✅ Done
- Academy: create, retrieve (API + Angular setup page)
- Athletes: full CRUD API, list UI with belt/status filters, pagination, soft-delete

### M3 — Documents & Deadlines ✅ Done
- Documents: full CRUD API (upload, list, download, soft-delete), Angular list UI with cancelled toggle, reactive-form upload dialog, cross-athlete expiring list.
- Dashboard widget surfaces documents expiring in the next 30 days with a deep-link to the filtered list.
- See [`docs/specs/m3-documents.md`](docs/specs/m3-documents.md) for the PRD.

### M4 — Attendance 📋 Planned
Log class check-ins (single or bulk). Attendance history per athlete. Monthly summary.

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
│   │   ├── Actions/          # Single-responsibility business operations
│   │   ├── Enums/            # Belt, AthleteStatus
│   │   ├── Http/
│   │   │   ├── Controllers/  # Thin — delegate to Actions
│   │   │   ├── Requests/     # All input validation
│   │   │   └── Resources/    # All API response shaping
│   │   └── Models/           # Eloquent models
│   ├── database/
│   │   ├── factories/        # Test data factories
│   │   ├── migrations/       # DB schema
│   │   └── seeders/          # Local dev seed data
│   ├── routes/api_v1.php     # All v1 routes
│   └── tests/Feature/        # PEST 4 feature tests (TDD)
│
├── client/               # Angular 21 SPA
│   └── src/app/
│       ├── core/
│       │   ├── guards/       # Auth + academy guards
│       │   ├── interceptors/ # Attach Bearer token to every request
│       │   └── services/     # AcademyService, AthleteService, AuthService
│       ├── features/
│       │   ├── auth/         # Login, Register pages
│       │   ├── academy/      # Setup page
│       │   ├── athletes/     # List page
│       │   └── dashboard/    # Layout shell (sidebar + router-outlet)
│       └── shared/
│           └── components/   # BeltBadge and other reusable components
│
├── docker/               # Dockerfiles + Nginx configs
├── postman/              # Postman collection
└── docker-compose.yml
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API framework | Laravel 13 |
| Auth | Laravel Sanctum (Bearer tokens) |
| Database | MySQL 8.4 |
| SPA framework | Angular 21 |
| UI components | PrimeNG 21 |
| Containerization | Docker + Compose |
| PHP tests | PEST 4 |
| PHP static analysis | PHPStan (level 9) |
| PHP style | PHP CS Fixer (PSR-12) |
| Releases | semantic-release (automated) |

---

## Development

For branching model, commit conventions, PR rules and CI pipeline details see **[CLAUDE.md](./CLAUDE.md)**.
