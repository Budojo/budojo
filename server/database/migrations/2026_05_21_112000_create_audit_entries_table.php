<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Immutable audit log of academy actions (#429). See PRD at
 * `docs/specs/audit-log.md`.
 *
 * Schema invariants:
 *  - Rows are append-only — no `updated_at`.
 *  - Actor / academy / subject foreign keys all `nullOnDelete()`:
 *    deleting a user must not destroy the trail.
 *  - `before` / `after` are JSON columns; the redaction happens at
 *    write-time inside `App\Support\Audit\PiiRedactor` (next PR).
 *  - Three indexes for the three canonical query shapes:
 *    activity-page (academy + time), per-entity history
 *    (subject_type + subject_id), per-user history (actor_user_id +
 *    time).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_entries', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('actor_user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            // Denormalised at write time so the trail stays readable
            // after a user deletion (the FK above gets nulled, but the
            // human label survives — see PRD § "Schema").
            $table->string('actor_label', 255)->nullable();

            $table->foreignId('academy_id')
                ->nullable()
                ->constrained('academies')
                ->nullOnDelete();

            $table->string('action', 80);

            // Polymorphic subject — no constrained FK because the
            // subject can be ANY Eloquent model and the model class
            // can be removed in a future refactor without breaking
            // the trail. Validation lives in the WriteAuditEntry
            // action (FQCN string + integer id).
            $table->string('subject_type', 120)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            // Denormalised subject identifier (e.g. "Mario Rossi" /
            // "May 2026 payment") — survives soft-delete and lets the
            // activity-page render rows without an extra round-trip.
            $table->string('subject_label', 255)->nullable();

            // PII-redacted state snapshots. NULL on `created` /
            // `deleted` extremes; both set on `updated`.
            $table->json('before')->nullable();
            $table->json('after')->nullable();

            // Network metadata — IPv4 / IPv6 fits in 45 chars per
            // RFC 4291. user_agent capped at 512 (modern UAs ≈ 200,
            // bot UAs can be longer; we don't need the tail).
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 512)->nullable();

            // Append-only — no updated_at. `created_at` is the only
            // mutable surface (and it's set at insert, then frozen).
            $table->timestamp('created_at')->useCurrent();

            // Activity page — defaults to academy + reverse-chronological.
            $table->index(['academy_id', 'created_at'], 'audit_entries_academy_time_idx');
            // Per-entity history — the athlete detail "activity" tab
            // (future) reads this index.
            $table->index(['subject_type', 'subject_id'], 'audit_entries_subject_idx');
            // Per-user history — internal troubleshooting + the
            // multi-user era (when several users per academy exist).
            $table->index(['actor_user_id', 'created_at'], 'audit_entries_actor_time_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_entries');
    }
};
