# Budojo

> BJJ gym management — replace the Excel sheets with something built for the mat.

Budojo is a web application for Brazilian Jiu-Jitsu instructors. It replaces the typical mess of spreadsheets used to track students, documents, attendance and belt progressions with a clean, purpose-built tool.

---

## What it does (MVP scope)

### Today — what's live

| Area | Status | What you can do |
|------|--------|----------------|
| **Authentication** | ✅ Live | Register an account, log in, log out |
| **Academy setup** | ✅ Live (API) | Create and retrieve your academy profile |
| **Athlete management** | 🔨 In progress | — |
| **Documents** | 📋 Planned | — |
| **Attendance** | 📋 Planned | — |
| **Notifications** | 📋 Planned | — |
| **Promotions & reports** | 📋 Planned | — |

### User journey (once fully built)

```
Register → Set up your academy → Add athletes → Track belts & attendance
               ↓                      ↓                    ↓
         Name + address        Name, belt, docs       Check-ins, belt
                                                       promotions, reports
```

**First login flow:**
1. Register with email + password
2. You land on the academy setup page — enter your gym name and address
3. You're taken to the dashboard where you manage your student roster

---

## Roadmap

### M1 — Authentication ✅ Done
Register, login, logout via Sanctum Bearer tokens.

### M2 — Academy & Athletes 🔨 In progress
An instructor can create their academy and manage their full student roster.

- Academy setup (name, address, unique slug)
- Athlete CRUD: first/last name, email, phone, belt (white → black), stripes (0–4), status (active / suspended / inactive), joined date, date of birth
- Soft delete — athlete records are never permanently removed
- List with filters by belt and status

### M3 — Documents & Deadlines 📋 Planned
Upload and track key documents per athlete (ID, medical certificate). Alerts when expiry is approaching. Replaces the "expiry Excel sheet."

### M4 — Attendance 📋 Planned
Log class check-ins (single or bulk). Attendance history per athlete. Monthly summary for the academy.

### M5 — Notifications 📋 Planned
Automated email reminders before documents expire. Configurable lead time per academy.

### M6 — Promotions & Reports 📋 Planned
Belt promotion history, attendance reports, PDF/Excel export, analytics dashboard.

---

## Running locally

### Prerequisites
- Docker + Docker Compose
- A `.env` file at the repo root (copy `.env.example` and fill in values)

### Start the full stack

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Angular SPA | http://localhost:4200 |
| Laravel API | http://localhost:8000/api/v1 |
| MySQL | localhost:3306 |

Database migrations run automatically on API container start (`RUN_MIGRATIONS=1` in `docker-compose.yml`).

### Stop

```bash
docker compose down
```

---

## API — current endpoints

All endpoints are prefixed with `/api/v1`.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, returns Bearer token |

**Register / Login payload:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret",
  "password_confirmation": "secret"
}
```

**Login response:**
```json
{
  "data": {
    "token": "1|abc123...",
    "user": { "id": 1, "name": "John Doe", "email": "john@example.com" }
  }
}
```

### Authenticated (Bearer token required)

Add the token to every request:
```
Authorization: Bearer <token>
```

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/academy` | Create your academy (one per user) |
| `GET` | `/academy` | Get your academy |

**Create academy payload:**
```json
{
  "name": "Gracie Barra Lisboa",
  "address": "Rua Example 123, Lisboa"
}
```

**Academy response:**
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

A Postman collection is available at `postman/budojo.postman_collection.json`. It includes a test script that auto-saves the Bearer token after login.

---

## Project structure

```
budojo/
├── server/          # Laravel 13 REST API
│   ├── app/
│   │   ├── Actions/         # Single-responsibility business operations
│   │   ├── Http/
│   │   │   ├── Controllers/ # Thin — delegate to Actions/Services
│   │   │   ├── Requests/    # All input validation
│   │   │   └── Resources/   # All API response shaping
│   │   └── Models/
│   ├── routes/
│   │   └── api_v1.php       # All v1 routes
│   └── tests/Feature/       # PEST 4 feature tests
│
├── client/          # Angular 21 SPA
│   └── src/app/
│       ├── core/            # Guards, interceptors, services
│       └── features/        # One folder per feature (auth, academy, athletes…)
│
├── docker/          # Dockerfiles + entrypoint scripts
├── postman/         # Postman collection
└── docker-compose.yml
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API framework | Laravel 13 |
| Auth | Laravel Sanctum (Bearer tokens) |
| Database | MySQL 8.4 |
| SPA framework | Angular 21 + PrimeNG 21 |
| Containerization | Docker + Compose |
| PHP tests | PEST 4 |
| PHP static analysis | PHPStan (level 9) |
| PHP style | PHP CS Fixer (PSR-12) |
| Releases | semantic-release (automated) |

---

## Development

For contribution guidelines, branching model, commit conventions, and CI rules see **[CLAUDE.md](./CLAUDE.md)**.
