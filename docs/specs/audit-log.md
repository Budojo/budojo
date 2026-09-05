# Audit log (PRD — #429)

> **Status**: foundation shipping; observers + UI follow in separate PRs.

## Why

There is no audit trail today. If an athlete is deleted by mistake (or maliciously, in the future multi-user world) there is no record of who did it or when. GDPR Art. 5 §2 (accountability principle) plus ordinary "who deleted Mario's payment last Tuesday" troubleshooting both demand an immutable log.

## Decision: hand-rolled, not `spatie/laravel-activitylog`

| | Hand-rolled | spatie/laravel-activitylog |
|---|---|---|
| Academy scoping | ✓ first-class column | retrofit via `subject_type='Academy'` joins |
| Custom PII redaction | ✓ controlled at write-time | filter chain hooks; another layer to maintain |
| Observer pattern | ✓ matches existing `App\Observers\*` discipline | uses traits on models — different ergonomics |
| Dependency surface | none added | another Composer dep + their schema (8 columns we don't need) |
| Migration ownership | ours | shared with the upstream library |

The cost of writing ~100 LoC of `WriteAuditEntry` is smaller than the ongoing cost of carrying a generic library whose conventions don't quite match ours.

## Schema

`audit_entries` table:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `actor_user_id` | bigint nullable FK users | NULL when the action is system-generated (cron, observer reaction to another model). `nullOnDelete()` so deleting a user keeps the trail. |
| `actor_label` | string(255) nullable | Denormalised at write time (e.g. "Matteo Bonanno"). Survives user deletion + makes the activity page readable without re-fetching. |
| `academy_id` | bigint nullable FK academies | NULL for cross-academy / system events. `nullOnDelete()`. |
| `action` | string(80) | Dotted verb like `athlete.deleted`, `payment.updated`, `academy.logo.replaced`. Enum-like; lowercased; max 80 chars (greppable in logs). |
| `subject_type` | string(120) nullable | Eloquent model FQCN, e.g. `App\Models\Athlete`. Nullable for system-level events that have no subject (e.g. `audit.prune` itself). |
| `subject_id` | bigint nullable | |
| `subject_label` | string(255) nullable | Denormalised identifier (e.g. "Mario Rossi" / "May 2026 payment"). Survives soft-delete. |
| `before` | json nullable | Pre-mutation state, PII-redacted. NULL on `created` events. |
| `after` | json nullable | Post-mutation state, PII-redacted. NULL on `deleted` events. |
| `ip` | string(45) nullable | IPv4 / IPv6 string. |
| `user_agent` | string(512) nullable | Truncated to 512 — UAs can be longer; we don't need the tail. |
| `created_at` | timestamp | No `updated_at` — rows are immutable. |

Indexes:
- `(academy_id, created_at desc)` — activity page filter, default ordering
- `(subject_type, subject_id)` — per-entity history (athlete activity tab)
- `(actor_user_id, created_at desc)` — per-user activity history

## Action naming convention

`<resource>.<verb>[.<qualifier>]`, lowercase. Examples:

| Action | When |
|---|---|
| `athlete.created` | Athlete row inserted (any path — manual, invite-accept) |
| `athlete.updated` | Athlete row updated (any non-trivial field — see redaction below) |
| `athlete.deleted` | Soft-delete of an athlete |
| `athlete.belt.promoted` | A specific belt-change event (qualifier for filterability) |
| `payment.created` | New payment row |
| `payment.updated` | Edit on an existing payment |
| `payment.deleted` | Soft-delete (or hard) |
| `carnet.created` | An entry carnet was sold (#1364) |
| `carnet.updated` | Its validity window was moved (#1380) — which changes what the athlete has already paid for, so the before/after is worth keeping |
| `carnet.deleted` | A mis-sale was undone (#1380). The sessions it covered stay on the attendance register |
| `document.uploaded` | New document |
| `document.deleted` | Soft-delete |
| `attendance.marked` | Bulk-mark (1 entry per athlete) |
| `attendance.unmarked` | Cancel an attendance row |
| `academy.updated` | Edit on academy core data |
| `academy.logo.replaced` | Upload of new logo |
| `audit.pruned` | The cleanup cron writes its own audit row (paradox solved by setting `actor_user_id=null` + `actor_label='system'`) |

## PII redaction at write time

The `before` / `after` JSONs **must not** carry raw email, phone, fiscal code, address, or any health-data field unredacted. The discipline:

- Email / phone → SHA-256 prefix (first 8 hex chars + `...`). Enough to confirm "the value changed" without leaking the value itself.
- Fiscal code → `***[last 4 chars]` (Italian regulator pattern for `Codice Fiscale`).
- Address / freeform notes → omitted entirely (`'<redacted>'` string in their place).
- Belt / stripes / status enum values → kept as-is (already public-facing within the academy).
- Timestamps → kept (no PII).
- IDs / FKs → kept.

The redaction lives in a dedicated `App\Support\Audit\PiiRedactor` so a future regulator-mandated change has one surface to flip.

## Observers (next PR)

One observer per audited Eloquent model, fired on `created`, `updated`, `deleted` lifecycle hooks. Each observer:

1. Captures the actor from `auth()->user()` (defensive — falls back to `null` for queue / cron writes).
2. Constructs the `(before, after)` pair from `$model->getOriginal()` / `$model->getAttributes()`.
3. Pipes through `PiiRedactor`.
4. Calls `WriteAuditEntry::execute(...)`.

The observer never throws upward — a logging failure cannot fail the user request. Errors get a `Log::warning` with the audit payload for triage.

## Pruning

`php artisan audit:prune` — configurable retention (default 365 days, `config('audit.retention_days')` env-overridable). Run nightly via the scheduler. The prune itself writes an `audit.pruned` row capturing how many entries were removed (the only `audit.*` action; observers don't audit audits).

## UI (next PR)

`/dashboard/academy/activity` — owner-only paginated table:
- Default ordering: `created_at desc`
- Filters: action (multi-select), actor (autocomplete on users), date range, subject (athlete autocomplete)
- Each row links to the subject's detail page when the resource still exists; falls back to the denormalised `subject_label` when not.
- Mobile: card layout, infinite-scroll.

Role gate: `role:owner` middleware. The athlete portal doesn't get an activity surface in V1 (their own posts already show in the community feed; the activity log is owner-side troubleshooting).

## Performance & retention

- The `(academy_id, created_at)` index keeps the activity page query a single seek + sequential scan over the slice; with 365-day retention and ~1k writes/day per academy, that's ~365k rows per academy — trivially handled by InnoDB on the existing slimbook server.
- If an academy ever exceeds 10k actions/day (which would be a M5+ usage signal worth celebrating), we revisit partitioning by month.

## Test plan (this foundation PR)

PEST feature spec covering:
- `WriteAuditEntry` persists every field correctly with a typical payload.
- `WriteAuditEntry` accepts a null actor and writes `actor_label='system'`.
- `WriteAuditEntry` writes `created_at` from the current clock (Carbon TestNow).
- `WriteAuditEntry` truncates user-agent to 512 chars without throwing.
- `AuditEntry` model casts `before` / `after` to arrays on read.

PEST feature specs for the observers + the activity-page route ship in their respective follow-up PRs.

## Out of scope (V1)

- Cross-academy / sysadmin audit log (single-tenant view only).
- Forwarding logs to an external SIEM (Splunk / Sentry log channel).
- Diff rendering in the UI (V1 shows `action` + `subject_label` + `actor_label`; the JSON diffs are queryable via the DB but not visible).
- Reverting from a log entry ("undelete this athlete"). Audit is read-only.

## References

- GDPR Art. 5 §2 — Accountability principle
- Existing observer pattern: `App\Observers\AthleteObserver` (wired via `#[ObservedBy(AthleteObserver::class)]`)
- Multi-user umbrella (#428) — the "actor" concept gains real value once multiple users per academy exist
