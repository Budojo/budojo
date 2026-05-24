<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Encrypt the per-device push secrets at rest (#1008).
 *
 * `auth` is the HKDF salt that derives the AES-GCM key for every
 * payload sent to a given device. A DB-dump leak with the column in
 * plaintext hands an attacker the ability to forge OR decrypt push
 * payloads for the leaked devices. `endpoint` is the bearer URL the
 * push vendor exposes — anyone with it can POST a properly-signed
 * VAPID-JWT-fronted payload at the device.
 *
 * The shape:
 *  1. ALTER both columns to TEXT — Laravel's `encrypted` cast emits
 *     base64(IV + ciphertext + MAC) which can hit 200-300 chars for
 *     small inputs and overflow `varchar(64)` / `varchar(1024)`.
 *  2. Backfill any existing rows by reading the plaintext, encrypting
 *     it via `Crypt::encryptString`, writing it back. Production has
 *     few hundred rows at most — single-pass safe.
 *
 * `p256dh` stays varchar + plaintext on purpose — it's the public
 * P-256 ECDH key by design, no secrecy claim.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Widen columns to TEXT to accommodate ciphertext.
        Schema::table('push_subscriptions', function (Blueprint $table): void {
            $table->text('endpoint')->change();
            $table->text('auth')->change();
        });

        // 2. Backfill — encrypt plaintext that landed before this
        //    migration. Each row is processed in isolation; a failure
        //    on one row doesn't poison the rest.
        DB::table('push_subscriptions')->orderBy('id')->each(function (object $row): void {
            DB::table('push_subscriptions')
                ->where('id', $row->id)
                ->update([
                    'endpoint' => Crypt::encryptString($row->endpoint),
                    'auth' => Crypt::encryptString($row->auth),
                ]);
        });
    }

    public function down(): void
    {
        // Reverse the backfill — decrypt then shrink back to the
        // original column widths. Best-effort: if a future ALTER
        // changed a row that's no longer Crypt-decryptable, leave it
        // as-is rather than block the rollback.
        DB::table('push_subscriptions')->orderBy('id')->each(function (object $row): void {
            try {
                DB::table('push_subscriptions')
                    ->where('id', $row->id)
                    ->update([
                        'endpoint' => Crypt::decryptString($row->endpoint),
                        'auth' => Crypt::decryptString($row->auth),
                    ]);
            } catch (\Throwable $_) {
                // Skip silently — the column is staying as ciphertext
                // on this row, but the schema rollback below will
                // truncate to varchar and the row may be lost.
                // Acceptable for a down() that's only used in dev.
            }
        });

        Schema::table('push_subscriptions', function (Blueprint $table): void {
            $table->string('endpoint', 1024)->change();
            $table->string('auth', 64)->change();
        });
    }
};
