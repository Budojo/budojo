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

### Patterns we explicitly reject (and why)

This section is the negative space of the canon above. Every pattern listed here is a thing experienced engineers (including Claude) will occasionally propose — usually imported from Java/Spring / .NET / pre-Laravel PHP — and every item below explains why adopting it in THIS codebase would be a regression, not a lift. The rejections are **opinionated, not dogmatic**: the escape-hatch subsection at the end lists the precise conditions under which each pattern earns its keep.

**1. Repository pattern over Eloquent.**
The proposal: a `DocumentRepository` class that wraps `Document::where(...)`, exposing a query API the Service layer calls instead of touching Eloquent directly. The intuition: "decouple business logic from the ORM so we can swap databases or mock queries in tests."
Why we reject it:

- Eloquent Model **is** the repository. `Document::query()->where(...)->get()` is already a testable query API — no wrapper adds reachability we don't have.
- Testability is delivered by `RefreshDatabase` + `Model::factory()`. We don't need mocks; we hit an in-memory SQLite and assert real rows. That's both faster and more honest than asserting `->shouldReceive('find')`.
- Swapping databases is YAGNI. If it ever stops being YAGNI, we'll feel the pain first in specific queries and extract surgically.

What we do instead: **Active Record via Eloquent, business logic in Actions, Models stay skinny** (relations, casts, scopes only). See the Active Record caveat above — this rejection is its explicit corollary.

**2. Multi-method "Service" classes.**
The proposal: a single `DocumentService` that exposes `upload(...)`, `delete(...)`, `listExpiring(...)`, `download(...)`, etc. The intuition: "all document operations live under one class name, easy to find."
Why we reject it:

- A class with N methods changes for N reasons — the opposite of SRP. `DocumentService` becomes a God class as the domain grows.
- "Easy to find" is solved by folder organisation, not by lumping. `app/Actions/Document/` already groups everything document-related.
- One-method-per-class (the Action pattern) makes each public entry point trivially diffable, trivially testable, and trivially composed — an Action can inject another Action via constructor without circular-dependency headaches.

What we do instead: **one Action per business use case**, named as a verb + noun, with a single `execute(...)` public method. `UploadDocumentAction`, `DeleteDocumentAction`, `GetExpiringDocumentsAction`. Vertical slicing by domain (`Actions/Document/`, `Actions/Academy/`), not horizontal by layer.

**3. Interfaces for single-implementation services.**
The proposal: declare `DocumentServiceInterface` and bind it to the concrete `DocumentService` in a `ServiceProvider`. The intuition: "Dependency Inversion Principle — depend on abstractions, not concretions."
Why we reject it:

- DIP is about dependency **direction**, not about always introducing an `interface` keyword. A `DocumentController` depending on a concrete `UploadDocumentAction` in its constructor already satisfies DIP — the *concept* being depended on is the Action's public contract, regardless of whether PHP's type system spells it as `interface` or `class`.
- With one implementation, the interface is ceremony: every edit requires touching two files; IDEs and static analysers do MORE work, not less; no caller ever exploits the abstraction.
- Laravel's service container **auto-resolves concrete type-hints** via reflection. No binding registration is required for 1-to-1 mappings, so `ServiceProvider` stays lean and grep-able.

What we do instead: **concrete type-hints in Action and Controller constructors**, resolved by the container. Interfaces only land when there's a real second implementation or a real test-double need (see escape hatch below).

**4. Dedicated DTO classes for simple CRUD.**
The proposal: declare `UploadDocumentDto` / `CreateAthleteDto` with typed public properties, constructed in the Controller from request data, passed to the Action. The intuition: "compile-time type safety through the whole call chain."
Why we reject it:

- `FormRequest::validated()` returns an array whose shape is pinned by `rules()`. Combined with PHPStan level 9 + typed `execute(...)` parameters on the Action, we already get the type guarantees a DTO class would provide — at zero ceremony cost.
- Hand-rolled DTO classes without schema-to-DTO generation drift from the request validation over time (rename a field in `rules()`, forget to rename in the DTO — bug).

What we do instead: **FormRequest IN, Resource OUT**, plus typed primitive parameters on `Action::execute(...)`. If a payload grows complex enough that we want compile-time types end-to-end, `spatie/laravel-data` is the escape hatch — we adopt it the day the first payload justifies it, not pre-emptively.

**5. Aggregating bindings into a custom `ServiceServiceProvider`.**
The proposal: a dedicated provider class that imports all Service interfaces and calls `$this->app->bind(XInterface::class, X::class)` for each. The intuition: "one file tells me every binding in the app."
Why we reject it:

- When rejections 1–4 are in effect, there's nothing to aggregate. 1-to-1 concrete type-hints don't need registration.
- Custom providers introduce a surface area that's easy to drift: bindings added and never used, circular `app()->make()` calls inside providers, boot-time perf regressions that are hard to pin down.
- Laravel already has `AppServiceProvider` for the rare real case. A second "only services live here" provider is file-splitting-for-its-own-sake.

What we do instead: **`AppServiceProvider::register()` holds the handful of bindings that genuinely need the container's attention** (e.g. swappable storage the day we add S3). Everything else rides auto-resolution.

#### When abstraction DOES belong (escape hatches)

The rejections above are conditional. Introduce the abstraction the moment these specific conditions are met, not before:

- **Interface with multiple implementations.** Example: the day we add S3 alongside the `local` disk, a `FileStorageInterface` with `LocalFileStorage` + `S3FileStorage` is correct. Two concrete bindings, one call site per interface: the abstraction pays for itself.
- **External-vendor boundary that tests must stub.** Example: M5's `NotificationService` for email/SMS — we never want real SendGrid calls in PEST runs. Interface + fake implementation + container binding is the right shape.
- **Pure domain logic shared between ≥ 2 Actions.** Example: if 3 Actions all need "compute days-to-expiry considering the academy's timezone," extract a pure `ExpiryCalculator` class (no interface, just a dependency-free value object) and inject it into each Action. That's **not** a Service layer — it's a domain helper. Rule of three applies.
- **The Active Record caveat breaks.** A CLI tool or a console worker that needs to manipulate documents without booting the HTTP kernel might justify a thin repository. Reopen the decision then.

The pattern everywhere: **abstract the day the second caller or the second implementation is real**, not the day a book suggests it should exist.

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
