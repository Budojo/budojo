# Budojo — Server CLAUDE.md

This file is loaded by Claude Code when you (or an agent) work under `server/`. It **extends** the root `CLAUDE.md` — read both. Anything written here takes precedence over the root file for backend work.

## Scope

Applies to every file under:
- `server/app/**` — Laravel app code (Controllers, Actions, Models, Http/Requests, Http/Resources, Observers, Enums)
- `server/database/**` — migrations, factories, seeders
- `server/routes/**`
- `server/tests/**`

Boilerplate folders (`config/`, `bootstrap/`, `public/`, `storage/`, `vendor/`) are out of scope.

---

## Code craftsmanship — the Uncle Bob canon

This codebase is written (and reviewed) in the spirit of Robert C. Martin's "Clean" series. When a reviewer asks "why did you do it that way?" the intended default reference is one of these four books, by name. They are the shared vocabulary for judging backend code.

| Book | What we take from it |
|------|----------------------|
| **Clean Code** (2008) | Function hygiene, naming, comments, tests as first-class code |
| **The Clean Coder** (2011) | Professional discipline — saying no, owning estimates, refusing to ship slop under pressure |
| **Clean Architecture** (2017) | SOLID in depth, the Dependency Rule, layered boundaries between policy and I/O |
| **Clean Agile** (2019) | XP practices — TDD, pair programming, continuous refactoring, small releases |

If a reviewer (human or Copilot) cites one of these books and the commit diff violates it, the citation is a valid argument on its own. Push back only with a specific, pragmatic reason (e.g. "Laravel's conventions override here, see the Active Record note below"). "I prefer it this way" is not a reason.

### SOLID — each letter, concrete

- **S — Single Responsibility.** A class changes for one reason. Controllers orchestrate, Actions do one business operation, FormRequests validate, Resources shape responses. No class wears multiple hats.
- **O — Open/Closed.** Open to extension, closed to modification. Prefer adding a new Action over editing an existing one. Prefer a new enum case over an `if/else` chain.
- **L — Liskov Substitution.** A subtype must be usable wherever the supertype is expected. Don't override a method to throw or to return a different shape. (Real example: the `UpdateDocumentRequest::validated()` override we reverted in PR #33 after Copilot correctly flagged it as breaking the parent contract.)
- **I — Interface Segregation.** Small, focused contracts. One FormRequest per operation, one Action per business use case with a single `execute(...)` method.
- **D — Dependency Inversion.** Inject Actions via constructor, not `Container::make()` inside methods. High-level policy depends on abstractions, not concretions.

### Clean Code — daily practice

Concrete obligations when you write PHP in this repo:

- **Meaningful names.** `createAcademy` is good, `handle` is lazy, `$a` is banned outside a two-line lambda. Class names are nouns (`UploadDocumentAction`). Method names are verbs (`execute`, `list`, `download`). Boolean variables read as questions (`$isExpired`, `$hasAcademy`).
- **Small functions.** If a method doesn't fit on a screen, it's too long. More than two levels of indentation? extract. Controller action > ~20 lines is a smell; most of ours sit at 10–15.
- **One thing per function.** A function either does, decides, or returns — not all three. `execute()` on an Action returns the created model; it doesn't also send an email. Side-effects are deliberate and named.
- **Few arguments.** Zero is ideal, 1–2 is fine, 3 is a stretch, 4+ is a refactor.
- **No flag arguments.** A boolean that flips the function's behaviour is two functions in a trench coat. Split it.
- **Comments are a failure.** Self-documenting code first. Comments only for *why*, never *what*. Exceptions: Laravel/Symfony quirks and non-obvious business rules.
- **Tests are first-class code.** Same naming standards, same cleanliness, same refactoring discipline.
- **Boy Scout Rule.** Leave the code cleaner than you found it — but keep cleanups tightly scoped; a 200-line PR that "also does some cleanup" is harder to review than two focused PRs.

### Clean Architecture — how this codebase maps

Uncle Bob's clean architecture pushes I/O to the edges and keeps business rules at the center. This Laravel codebase isn't a pure Clean Architecture shop — but we approximate it deliberately:

| Clean Architecture layer | Where it lives in Budojo |
|--------------------------|---------------------------|
| **Entities** (enterprise business rules) | `App\Enums` + domain invariants enforced in `Actions` |
| **Use Cases / Interactors** | `App\Actions\*` (e.g. `UploadDocumentAction`, `DeleteDocumentAction`) — one public `execute` method each |
| **Interface Adapters** | `App\Http\Requests` (inbound boundary), `App\Http\Resources` (outbound boundary), `App\Http\Controllers` (thin orchestration), `App\Observers` |
| **Frameworks & Drivers** | Laravel itself (routing, container, Eloquent), PEST, the web server |

**The Dependency Rule.** Dependencies point inward. A Controller can call an Action; an Action MUST NOT depend on a Controller. A Model/Action MUST NOT depend on an HTTP Request — accept typed arguments instead. If a new Action needs user context, it takes a `User $user` parameter; it does NOT call `auth()->user()`.

**Humble Object pattern.** Controllers, Observers, and Resources are "humble" — minimal logic, easy to leave alone. All conditional business rules live in Actions, which are framework-light and unit-testable without Laravel's HTTP stack.

### The Active Record caveat — pragmatic, not dogmatic

Laravel's Eloquent Model is an **Active Record**. Clean Architecture would prefer a plain-data Entity with a separate Repository. We consciously accept Active Record because:

1. Laravel's whole ecosystem (migrations, relations, factories, seeders, broadcasting) assumes it.
2. Fighting the framework creates more accidental complexity than decoupling saves.
3. The real-world blast radius is small (a single webapp, no multi-client SDK).

**The compensating discipline**: we keep Models skinny. No business logic in models — only relations, casts, scopes, and `#[ObservedBy]` wiring. Business logic lives in Actions. This preserves 90% of the testability and reasoning benefits of the Clean split, at 10% of the friction.

If this assumption ever breaks (e.g. we grow a CLI tool that needs to write documents without booting the full Laravel HTTP stack) we revisit. Until then, Active Record stands.

### Clean Agile — the meta-rule

Agile is the 90s practices XP put on the map, not the ceremony that corporations grafted on top in 2010. In this repo that means:

- **TDD is default, not optional.** See the TDD section in root `CLAUDE.md` — four layers, test first, no exceptions for "simple" code.
- **Refactor continuously.** Every time you touch a file, scan for dead code, unclear names, missed extractions. Apply the Boy Scout Rule with discipline.
- **Small releases.** Each PR ships independently. The mega-PR-merging-weeks-of-work style is forbidden here.
- **Honesty about estimates.** If a task is harder than expected, say so. Don't silently compress scope to look on-track.
- **Say no.** When a feature request violates scope or craftsmanship ("just slap it in, we'll fix it later"), refuse in writing and propose the right way.

---

## Server structure conventions

```
server/app/
├── Actions/        # Single-responsibility business operations (e.g. CreateAcademyAction, UploadDocumentAction)
├── Enums/          # Backed PHP enums (Belt, AthleteStatus, DocumentType, …)
├── Http/
│   ├── Controllers/  # Thin — validate input via Form Request, call Action, return Resource
│   ├── Requests/     # All input validation lives here, never in controllers
│   └── Resources/    # All API response shaping — never return raw Eloquent models
├── Models/         # Eloquent models — relations, scopes, casts only; no business logic
└── Observers/      # Event handlers (e.g. AthleteObserver cascades delete to documents)
```

- **Controllers** — thin: receive request → delegate to Action → return Resource.
- **Actions** — contain all business logic; one class, one operation, one public `execute` method.
- **Form Requests** — validation and authorisation gates. `authorize()` checks user+academy+ownership; `rules()` is the only place where input validation lives.
- **Resources** — shape every API response; never expose raw model attributes.
- **Models** — relations, scopes, casts. No business logic.
- **Observers** — Eloquent event handlers, wired via `#[ObservedBy(...)]` attribute on the model.

---

## Static Analysis (PHPStan)

- PHPStan at **level 9** (max). Config: `server/phpstan.neon`.
- CI blocks merge on any error.
- Memory: run with `--memory-limit=1G` if you hit the default 128M ceiling (the analysis load has grown past the default).

---

## Code Style (PHP CS Fixer)

- Config: `server/.php-cs-fixer.php`
- Rulesets: `@PHP84Migration`, `@PSR12`, `@PSR12:risky`
- Key rules: `declare_strict_types`, `use_arrow_functions`, `ordered_imports`
- CI blocks merge if any file needs fixing.

---

## Testing (PEST 4)

```bash
cd server

# Run all tests
vendor/bin/pest --parallel

# Run a single file
vendor/bin/pest tests/Feature/Athlete/AthleteTest.php
```

- **Feature tests** hit a real SQLite `:memory:` DB via `RefreshDatabase`; run full HTTP round-trips.
- **Unit tests** mock external dependencies.
- Shared helpers (`userWithAcademy()`, etc.) live in `tests/Pest.php` — use them, don't redefine per file.
- Coverage generated on every PR; grows with TDD — no enforced minimum threshold.

---

## API conventions

- Versioned routes: `/api/v1/...` defined in `routes/api_v1.php`
- JSON:API-style responses with consistent error envelope
- Auth via **Laravel Sanctum** Bearer tokens (token per session, not cookie)
- Every authenticated endpoint re-checks academy ownership in the controller (or via a Form Request's `authorize()`). No global scope — explicit every time.

---

## What Claude Should Always Do — backend-specific

(These complement the general rules in root `CLAUDE.md`.)

- **Write code in the Uncle Bob canon.** SOLID, small single-purpose functions, intention-revealing names, comments only for *why*, Dependency Rule. A book citation by a reviewer is a valid critique on its own — push back only with a specific pragmatic reason, never with taste.
- **Keep controllers thin.** Validate via Form Request, delegate logic to an Action, return a Resource. If a controller action is > ~20 lines, it's doing too much.
- **Use Form Requests for all validation.** Never validate in controllers. `authorize()` carries the ownership check, `rules()` carries the input shape.
- **No business logic in Models.** Relations, casts, scopes, observer wiring — that's it. If you're reaching for an `->isXxx()` method, it probably wants to live in an Action or a dedicated service.
- **Eager-load relations** when you know you'll iterate them (`with('athlete')`). N+1 queries are a SOLID violation in practice.
- **Before pushing PHP changes:** `vendor/bin/php-cs-fixer fix` → `vendor/bin/phpstan analyse --no-progress --memory-limit=1G` → `vendor/bin/pest --parallel`. All three must be clean.
- **Keep `docs/entities/` and `docs/api/v1.yaml` in sync** with every migration, enum, route, or payload change — same PR. See root `CLAUDE.md` § Documentation discipline.
