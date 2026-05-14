<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pending team invitations (#427 / #714, sub-issue 1/9).
 *
 * One row per outstanding invite. Acceptance or revocation HARD-DELETES
 * the row — the membership row itself (which IS soft-revoked) is the
 * canonical audit trail of "who joined when, who left when"; the
 * invitation row's job ends the moment the membership exists or the
 * inviter retracted. PRD § 5.2 covers the rationale (the alternative
 * would have been a partial unique index, which MySQL 8 doesn't
 * support).
 *
 * **Token shape** (PRD § 7): the server generates a 256-bit raw random
 * string (`Str::random(64)`) and stores only its SHA-256 in
 * `token_hash`. The email link carries the raw value; the accept
 * endpoint re-hashes and looks up by `token_hash`. Same shape as
 * Laravel's password-reset table.
 *
 * **Role**: `varchar(16)` cast to `MembershipRole`, but the FormRequest
 * validation layer rejects `owner` at the input boundary — no
 * ownership transfer in v1 (PRD § 3 non-goal).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academy_invitations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')
                ->constrained('academies')
                ->cascadeOnDelete();
            $table->string('email', 255);
            $table->string('role', 16);
            $table->char('token_hash', 64);
            $table->foreignId('invited_by_user_id')
                ->constrained('users');
            $table->timestamp('expires_at');
            $table->timestamps();

            // One pending invite per (academy, email). Re-inviting an
            // address with a still-pending row 422s at the validation
            // layer ("invitation already pending") — see sub-issue
            // 5/9 for the FormRequest.
            $table->unique(['academy_id', 'email'], 'academy_invitations_academy_email_unique');
            // Token lookup at accept time.
            $table->index('token_hash', 'academy_invitations_token_hash_index');
            // Used by the expiry cron (sub-issue 5/9).
            $table->index('expires_at', 'academy_invitations_expires_at_index');
            // Used at register-with-token to find any pending invites
            // matching the new account's email.
            $table->index('email', 'academy_invitations_email_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_invitations');
    }
};
