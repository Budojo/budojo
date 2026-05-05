# Budojo — Documentation

This folder is the living reference for Budojo's domain model, API contract, and product specs. If you (or a future collaborator, or a Claude agent) need context on how the system is shaped today, start here — not from the code.

## Structure

```
docs/
├── README.md                          # this file — the index
├── entities/                          # one file per persisted domain entity
│   ├── user.md
│   ├── personal-access-token.md
│   ├── academy.md
│   ├── athlete.md
│   ├── athlete-payment.md
│   ├── address.md                     # polymorphic, owned by Academy + Athlete (#72)
│   ├── document.md
│   └── support-ticket.md              # support form submission (#423)
├── api/
│   ├── README.md                      # how to view the spec locally (Swagger UI, Redocly)
│   └── v1.yaml                        # OpenAPI 3.0.3 — complete contract for /api/v1
├── specs/                             # milestone PRDs
│   ├── m3-documents.md                # M3 — Documents & Deadlines
│   └── m4-attendance.md               # M4 — Attendance (with `Deltas from spec`)
├── infra/                             # operations / deployment
│   ├── branch-rulesets.md             # GitHub branch protection rulesets
│   └── production-deployment.md       # the live stack: DNS, Forge, Cloudflare, runbook, gotchas
├── adr/                               # architectural decision records
│   └── 0001-svg-sanitizer.md
└── design/                            # design system (MD3, palette, tokens, component matrix)
    ├── README.md
    ├── DESIGN_SYSTEM.md
    ├── brand-kit/                     # 13 standalone SVG logo variants for handoff / pitch decks
    └── preview/                       # static HTML previews of the variant matrix
```

## Who reads what

| Audience | What to read |
|---|---|
| New contributor onboarding | `entities/` then `api/v1.yaml` |
| Front-end / API consumer | `api/v1.yaml` (import into Postman, Insomnia, or Swagger UI) |
| On-call / deployer | `infra/production-deployment.md` for the live runbook + env / DNS / TLS topology |
| Claude Code agent | Everything — the PR will fail review if docs are stale (see `CLAUDE.md` "Documentation discipline") |
| Product planning | `specs/` |
| UI / design contributor | `design/DESIGN_SYSTEM.md` and `design/preview/` |

## Update discipline

This folder is source-of-truth. Any PR that changes:

- A migration (new table, new column, new index, altered constraint)
- A backed enum (new case)
- An API route (new endpoint, new query param, changed payload or response)
- A business rule that's expressed in code but not in the schema (e.g. academy ownership scoping, soft-delete semantics)

…must update the relevant file in `docs/` **in the same PR**. Claude's CLAUDE.md has a rule (`#16`) to enforce this; the CI Spectral job catches malformed OpenAPI.

If a change is purely internal (refactor, rename of a private symbol, formatting) and does not alter the public contract — no doc update needed.

## OpenAPI convention

- Single-file monolith (`api/v1.yaml`) for now. When the file grows past ~1500 lines, split into `paths/` and `components/schemas/`.
- OpenAPI 3.0.3 (not 3.1) — broader tooling support (Swagger UI, Redocly, Postman, Insomnia, Stoplight).
- Every schema referenced inline must have a matching entry under `components/schemas/`. Spectral `lint` in CI blocks ghost references.
