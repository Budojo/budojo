<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TOTP-based two-factor auth columns on `users` (#412).
 *
 * Three nullable columns added side-by-side so an existing user
 * with no 2FA stays in the "disabled" state by default (every
 * value null). The login flow consults `two_factor_confirmed_at`
 * — present means enrolment was completed AND verified; null
 * means either never enrolled OR enrolled-but-not-yet-confirmed
 * (the QR-code-shown-but-no-TOTP-entered-yet state).
 *
 * **Encryption at-rest** — `two_factor_secret` and
 * `two_factor_recovery_codes` are stored encrypted via Eloquent's
 * `encrypted` cast on the User model. Even a database dump leak
 * doesn't yield usable TOTP secrets without the app key. The
 * column type is text (not string) because encryption inflates
 * the byte count beyond varchar 255 in practice.
 *
 * **Recovery codes shape** — 8 single-use codes per enrolment,
 * stored as a JSON array; consumed individually on a successful
 * login-challenge use, the array shortens by one. When the array
 * hits 0 the SPA prompts the user to regenerate before signing
 * out of every other session.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Base32-encoded TOTP secret. ~32 chars unencrypted; once
            // the model's `encrypted` cast wraps it, the ciphertext
            // routinely exceeds 200 chars — text type avoids the
            // string(255) ceiling.
            $table->text('two_factor_secret')->nullable();

            // JSON array of 8 single-use plaintext codes. Same
            // ciphertext-inflation rationale as `two_factor_secret`
            // — text not string.
            $table->text('two_factor_recovery_codes')->nullable();

            // Set when the user completes the enrolment flow (i.e.
            // scans the QR, types a valid TOTP, posts it back). Null
            // means 2FA is NOT active for this user, even if a
            // partial-enrolment secret happens to sit in
            // `two_factor_secret` (we wipe it on regen, but the
            // confirmed-at check is the load-bearing gate).
            $table->timestamp('two_factor_confirmed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
            ]);
        });
    }
};
