# Budojo — Server CLAUDE.md

Loaded by Claude Code when you (or an agent) work under `server/`. **Extends** the root `CLAUDE.md` — read both. Anything here takes precedence for backend work.

## Scope

Applies to every file under:

- `server/app/**` — Laravel app code (Controllers, Actions, Models, Http/Requests, Http/Resources, Observers, Enums)
- `server/database/**` — migrations, factories, seeders
- `server/routes/**`
- `server/tests/**`

Boilerplate (`config/`, `bootstrap/`, `public/`, `storage/`, `vendor/`) is out of scope.

---

## Code craftsmanship — the Uncle Bob canon

This codebase is written (and reviewed) in the spirit of Robert C. Martin's "Clean" series. The four books below are the **shared vocabulary** for judging backend code — a citation by name is a valid critique on its own. Push back only with a specific pragmatic reason ("Laravel's conventions override here"), never with taste.

| Book | What we take from it |
|------|----------------------|
| **Clean Code** (2008) | Function hygiene, naming, comments, tests as first-class code |
| **The Clean Coder** (2011) | Professional discipline — saying no, owning estimates, refusing to ship slop under pressure |
| **Clean Architecture** (2017) | SOLID in depth, the Dependency Rule, layered boundaries between policy and I/O |
| **Clean Agile** (2019) | XP practices — TDD, pair programming, continuous refactoring, small releases |

### The Uncle Bob skills — consult by default

The first two books above are distilled into two **user-level** Claude knowledge-base skills — **`clean-code`** (Clean Code 2e, 37 chapters) and **`clean-architecture`** (Clean Architecture, 34 chapters). **Default to consulting them before answering a judgment call here** — `/clean-code <topic>` or `/clean-architecture <topic>` — and pull the exact formulation, not a paraphrase:

- **A reviewer cites a book or law** → e.g. `/clean-architecture ch07` for *which actor* owns an SRP change; `/clean-code ch08` for argument / Command-Query-Separation / exceptions-over-error-codes heuristics.
- **An Eloquent / Active-Record boundary question** → `/clean-architecture ch30` (The Database Is a Detail) + `/clean-code ch12` (Objects vs Data Structures) — reinforces the Active Record caveat below.
- **Shaping a new Action / boundary / migration** → `/clean-architecture ch20` (Entities vs Use Cases) + `ch22` (the Dependency Rule), which map onto the *how this codebase maps* table below.

Skip for typos, formatting, or anything this canon already settles. The skills are user-level, not shipped with the repo, so any environment without them ignores this; the canon in this file stays the source of truth.

### SOLID — each letter, concrete

- **S — Single Responsibility.** A class changes for one reason. Controllers orchestrate, Actions do one business operation, FormRequests validate, Resources shape responses. No class wears multiple hats.
- **O — Open/Closed.** Prefer adding a new Action over editing an existing one. Prefer a new enum case over an `if/else` chain.
- **L — Liskov Substitution.** A subtype is usable wherever the supertype is expected. Don't override a method to throw or return a different shape. (See the `UpdateDocumentRequest::validated()` override reverted in PR #33.)
- **I — Interface Segregation.** Small, focused contracts. One FormRequest per operation, one Action per business use case with a single `execute(...)`.
- **D — Dependency Inversion.** Inject Actions via constructor, not `Container::make()` inside methods. Policy depends on abstractions, not concretions.

### Clean Code — daily practice

Concrete obligations:

- **Meaningful names.** `createAcademy` > `handle` > `$a`. Class names are nouns (`UploadDocumentAction`); method names are verbs (`execute`, `list`); boolean variables read as questions (`$isExpired`).
- **Small functions.** A method that doesn't fit on a screen is too long. More than two levels of indentation? extract. Controller action > ~20 lines is a smell.
- **One thing per function.** Either does, decides, or returns — not all three. Side-effects are deliberate and named.
- **Few arguments.** 0 ideal, 1–2 fine, 3 stretch, 4+ refactor.
- **No flag arguments.** A boolean that flips behaviour is two functions in a trench coat. Split it.
- **Comments are a failure.** Self-documenting code first. Comments only for *why*, never *what*. Exceptions: framework quirks and non-obvious business rules.
- **Tests are first-class code.** Same naming standards, same cleanliness, same refactoring discipline.

### Clean Architecture — how this codebase maps

| Clean Architecture layer | Where it lives in Budojo |
|--------------------------|---------------------------|
| **Entities** (business rules) | `App\Enums` + domain invariants enforced in `Actions` |
| **Use Cases / Interactors** | `App\Actions\*` — one public `execute` method each |
| **Interface Adapters** | `App\Http\Requests` (in), `App\Http\Resources` (out), `App\Http\Controllers` (orchestration), `App\Observers` |
| **Frameworks & Drivers** | Laravel itself, PEST, the web server |

**The Dependency Rule.** Dependencies point inward. A Controller can call an Action; an Action MUST NOT depend on a Controller. A Model/Action MUST NOT depend on an HTTP Request — accept typed arguments instead. A new Action that needs user context takes a `User $user` parameter; it does NOT call `auth()->user()`.

**Humble Object pattern.** Controllers, Observers, and Resources are "humble" — minimal logic, easy to leave alone. All conditional business rules live in Actions, framework-light and unit-testable without Laravel's HTTP stack.

### The Active Record caveat — pragmatic, not dogmatic

Laravel's Eloquent Model is an Active Record. Clean Architecture would prefer a plain Entity + Repository. We consciously accept Active Record because:

1. Laravel's whole ecosystem (migrations, relations, factories, seeders, broadcasting) assumes it.
2. Fighting the framework creates more accidental complexity than decoupling saves.
3. The real-world blast radius is small (a single webapp, no multi-client SDK).

**The compensating discipline**: Models stay skinny. No business logic in models — only relations, casts, scopes, and `#[ObservedBy]` wiring. Business logic lives in Actions. This preserves 90% of the testability and reasoning benefits of the Clean split, at 10% of the friction.

Revisit the day this breaks (e.g. a CLI tool that needs to write documents without booting the HTTP stack).

### Patterns we explicitly reject

The patterns below are things experienced engineers (including Claude) will propose — usually imported from Java/Spring/.NET — that would be a regression here, not a lift. Each rejection is **conditional**: introduce the pattern the day the escape-hatch condition below is met, not before.

1. **Repository pattern over Eloquent.** Eloquent Model is the repository. `RefreshDatabase` + factories give us real-DB tests, not mocks. Swapping DBs is YAGNI. → **Active Record via Eloquent, business logic in Actions, Models skinny**.
2. **Multi-method "Service" classes.** A `DocumentService` with N methods changes for N reasons (anti-SRP). → **One Action per business use case**, verb+noun, single `execute(...)`. Vertical slicing by domain (`Actions/Document/`).
3. **Interfaces for single-implementation services.** Ceremony with no payoff — Laravel's container auto-resolves concrete type-hints. → **Concrete type-hints in constructors**, resolved by the container.
4. **Dedicated DTO classes for simple CRUD.** `FormRequest::validated()` gives runtime guarantees; without schema-to-DTO generation, hand-rolled DTOs drift. → **FormRequest IN, Resource OUT**, plus typed primitive parameters on `Action::execute(...)`.
5. **Aggregating bindings into a custom `ServiceServiceProvider`.** With 1–4 in effect there's nothing to aggregate. → **`AppServiceProvider::register()` only**, and only when a binding is genuinely needed.

**Escape hatches** — introduce the abstraction the moment these specific conditions are met:

- Interface with **multiple implementations** (e.g. `LocalFileStorage` + `S3FileStorage`).
- External-vendor boundary that tests must stub (e.g. M5 `NotificationService` for email/SMS).
- Pure domain logic shared between ≥ 2 Actions (e.g. `ExpiryCalculator` value object — no interface needed, just a dependency-free helper).
- The Active Record caveat breaks (a CLI tool / console worker outside the HTTP kernel).

The pattern: **abstract the day the second caller or second implementation is real**, not the day a book says it should exist.

### Clean Agile — the meta-rule

Agile is the XP practices, not the corporate ceremony grafted on in 2010:

- **TDD is default, not optional.** Four layers, test first, no exceptions for "simple" code.
- **Refactor continuously.** Boy Scout Rule every time you touch a file.
- **Small releases.** Each PR ships independently. No mega-PRs.
- **Honesty about estimates.** Don't silently compress scope to look on-track.
- **Say no.** "Just slap it in" requests get a written refusal + the right way to do it.

---

## Server structure conventions

```
server/app/
├── Actions/        # Single-responsibility business operations (CreateAcademyAction, UploadDocumentAction)
├── Enums/          # Backed PHP enums (Belt, AthleteStatus, DocumentType)
├── Http/
│   ├── Controllers/  # Thin — validate via FormRequest, call Action, return Resource
│   ├── Requests/     # All input validation lives here, never in controllers
│   └── Resources/    # All API response shaping — never return raw Eloquent models
├── Models/         # Eloquent — relations, scopes, casts only; no business logic
└── Observers/      # Event handlers (wired via #[ObservedBy] attribute)
```

- **Controllers** — thin: receive request → delegate to Action → return Resource.
- **Actions** — one class, one operation, one public `execute(...)`. All business logic.
- **FormRequests** — validation + authorisation. `authorize()` = user/academy/ownership, `rules()` = input shape.
- **Resources** — shape every API response; never expose raw model attributes.
- **Models** — relations, casts, scopes only. No business logic.
- **Observers** — wired via `#[ObservedBy(...)]` attribute on the model.

---

## Static analysis, code style, tests

- **PHPStan level 9** (max). Config: `server/phpstan.neon`. Run with `--memory-limit=1G` if you hit the default 128M ceiling.
- **PHP CS Fixer**. Config: `server/.php-cs-fixer.php`. Rulesets: `@PHP84Migration`, `@PSR12`, `@PSR12:risky`. Key rules: `declare_strict_types`, `use_arrow_functions`, `ordered_imports`.
- **PEST 4** with `--parallel`. Feature tests use SQLite `:memory:` via `RefreshDatabase`; unit tests mock external dependencies. Shared helpers (`userWithAcademy()`, …) live in `tests/Pest.php`. No enforced coverage minimum — coverage grows with TDD.

CI blocks merge on any of the above failing. Run them locally via `./.claude/scripts/test-server.sh` before pushing.

---

## API conventions

- Versioned routes: `/api/v1/...` in `routes/api_v1.php`.
- JSON:API-style responses with consistent error envelope.
- Auth via **Laravel Sanctum** Bearer tokens (token per session, not cookie).
- Every authenticated endpoint re-checks academy ownership in the controller or in the FormRequest's `authorize()`. No global scope — explicit every time.

---

## What Claude Should Always Do — backend-specific

(Complements the rules in root `CLAUDE.md`.)

- **Write code in the Uncle Bob canon.** SOLID, small single-purpose functions, intention-revealing names, comments only for *why*, Dependency Rule. A book citation by a reviewer is a valid critique on its own.
- **Keep controllers thin.** Validate via FormRequest, delegate to Action, return Resource. Controller action > ~20 lines = doing too much.
- **Use FormRequests for all validation.** Never validate in controllers. `authorize()` holds the ownership check.
- **No business logic in Models.** Relations, casts, scopes, observer wiring — that's it. An `->isXxx()` method probably wants to live in an Action or a helper.
- **Eager-load relations** when you'll iterate them (`with('athlete')`). N+1 queries are a SOLID violation in practice.
- **Run `./.claude/scripts/test-server.sh` before every push.** All three (cs-fixer + phpstan + pest) must be clean.
- **Keep `docs/entities/` and `docs/api/v1.yaml` in sync** with every migration, enum, route, or payload change — same PR. See root `CLAUDE.md` § Documentation discipline.
