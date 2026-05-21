# `audit_entries` — Immutable audit log

Foundation table for #429. See the PRD at [`docs/specs/audit-log.md`](../specs/audit-log.md) for the full architecture; this file documents the persisted shape.

## Columns

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | bigint pk | — | |
| `actor_user_id` | bigint FK users | ✓ | `nullOnDelete()` — deleting the user keeps the trail. NULL on system-generated events. |
| `actor_label` | string(255) | ✓ | Denormalised "Matteo Bonanno" at write time. Survives `actor_user_id` going null. |
| `academy_id` | bigint FK academies | ✓ | `nullOnDelete()`. NULL on cross-academy / system events. |
| `action` | string(80) | ✗ | Dotted verb like `athlete.belt.promoted`. Enum-like, lowercased. |
| `subject_type` | string(120) | ✓ | Eloquent model FQCN, e.g. `App\Models\Athlete`. |
| `subject_id` | bigint | ✓ | |
| `subject_label` | string(255) | ✓ | Denormalised identifier (e.g. "Mario Rossi"). Survives soft-delete. |
| `before` | json | ✓ | Pre-mutation state, PII-redacted. NULL on `created` events. |
| `after` | json | ✓ | Post-mutation state, PII-redacted. NULL on `deleted` events. |
| `ip` | string(45) | ✓ | IPv4 / IPv6. |
| `user_agent` | string(512) | ✓ | Truncated at write time. |
| `created_at` | timestamp | ✗ | `useCurrent()` default + explicit set in `WriteAuditEntry`. |

**No `updated_at`** — rows are append-only.

## Indexes

- `audit_entries_academy_time_idx` on `(academy_id, created_at)` — the activity-page primary query shape.
- `audit_entries_subject_idx` on `(subject_type, subject_id)` — per-entity history (future athlete-detail "Activity" tab).
- `audit_entries_actor_time_idx` on `(actor_user_id, created_at)` — per-user troubleshooting + the multi-user era.

## Business rules

- **Append-only.** No writes after insert. Update path is forbidden by convention (the `WriteAuditEntry` action is the only sanctioned write site).
- **Actor label denormalised.** `actor_user_id` may go NULL when the user is deleted; `actor_label` survives so the trail remains human-readable.
- **PII redaction at write time.** The `before` / `after` JSONs must not carry raw email / phone / fiscal code / address / freeform notes. Lives in `App\Support\Audit\PiiRedactor` (next PR).
- **`actor_user_id IS NULL ⇒ actor_label = 'system'`** by convention — set by the `WriteAuditEntry` action when no actor is passed.

## Retention

`audit:prune` artisan command (next PR) — default 365 days, env-overridable via `config('audit.retention_days')`. Prune writes its own `audit.pruned` row.

## Related

- PRD: [`docs/specs/audit-log.md`](../specs/audit-log.md)
- Action: `App\Actions\Audit\WriteAuditEntry`
- Model: `App\Models\AuditEntry`
- Foundation issue: #429
