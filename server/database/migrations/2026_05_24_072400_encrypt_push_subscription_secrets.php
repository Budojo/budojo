<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
        //    migration. Idempotent against partial runs: MySQL DDL
        //    commits immediately and the row-loop runs outside any
        //    transaction, so a kill / DB blip / deploy timeout mid-
        //    flight leaves some rows encrypted and some plaintext.
        //    The guard below detects rows that already roundtrip
        //    cleanly through Crypt and skips them — a re-run is safe.
        //    Without the guard, `Crypt::encryptString(<ciphertext>)`
        //    silently wraps the row twice and the `encrypted` cast
        //    only unwraps one layer → permanent data corruption.
        DB::table('push_subscriptions')->orderBy('id')->each(function (object $row): void {
            try {
                Crypt::decryptString($row->endpoint);
                Crypt::decryptString($row->auth);
                // Both columns already decrypt → row was processed by
                // a prior (partial) run; skip to avoid double-wrap.
                return;
            } catch (\Throwable) {
                // Fall through — at least one column is still plaintext.
            }

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
        // Reverse the backfill — decrypt every row first, mark any
        // undecryptable ones for skip-shrink. The follow-up ALTER
        // (varchar 64/1024) must NOT silently truncate a row whose
        // ciphertext is still ~200 chars: in MySQL strict mode the
        // ALTER errors halfway, in non-strict mode the truncated
        // value is unrecoverable on a future re-up.
        $undecryptableIds = [];

        DB::table('push_subscriptions')->orderBy('id')->each(function (object $row) use (&$undecryptableIds): void {
            try {
                DB::table('push_subscriptions')
                    ->where('id', $row->id)
                    ->update([
                        'endpoint' => Crypt::decryptString($row->endpoint),
                        'auth' => Crypt::decryptString($row->auth),
                    ]);
            } catch (\Throwable $e) {
                // Log so a dev hitting this in rollback has a breadcrumb,
                // and remember the id so we delete the row before the
                // ALTER would corrupt it. APP_KEY rotation between up/down
                // is the most common cause; the row is unrecoverable
                // either way, deletion is the honest outcome.
                Log::warning('push_subscription rollback: undecryptable row', [
                    'id' => $row->id,
                    'reason' => $e->getMessage(),
                ]);
                $undecryptableIds[] = $row->id;
            }
        });

        if ($undecryptableIds !== []) {
            DB::table('push_subscriptions')
                ->whereIn('id', $undecryptableIds)
                ->delete();
        }

        Schema::table('push_subscriptions', function (Blueprint $table): void {
            $table->string('endpoint', 1024)->change();
            $table->string('auth', 64)->change();
        });
    }
};
