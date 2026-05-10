<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Distinguish session tokens from API tokens (#431).
 *
 * Until now every Sanctum PAT row was a "session token" — minted by
 * login / register / athlete-invite-accept, surfaced in the
 * "Active sessions" panel on `/dashboard/profile`. Adding the API-tokens
 * panel introduces a SECOND population in the same table: long-lived,
 * user-named, abilities-scoped tokens for integrations.
 *
 * Two surfaces, same backing table — the `kind` discriminator lets
 * each surface query only its own population:
 *
 *   - `kind = 'session'` → `/me/sessions` (default for every legacy row)
 *   - `kind = 'api'`     → `/me/api-tokens`
 *
 * **Why a string column instead of a boolean `is_api_token`?** Open
 * for extension: a future `kind = 'webhook'` (for outbound-webhook
 * delivery tokens, #432) or `kind = 'oauth'` (for 3rd-party app
 * tokens) lands without an ALTER TABLE.
 *
 * **Default + backfill** — every existing row is a session token; the
 * column default + a one-shot backfill UPDATE keep the migration
 * idempotent on a populated database. New tokens minted via
 * `$user->createToken(...)` get the default through the DB layer; the
 * `Issue*ApiTokenAction` will set 'api' explicitly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->string('kind', 16)
                ->default('session')
                ->after('name')
                ->index();
        });

        // Backfill: every pre-existing row is a session token. The
        // default would cover this on row-level INSERTs, but it
        // doesn't retroactively populate column-level NULLs on rows
        // that existed before the column. Belt + suspenders.
        DB::table('personal_access_tokens')
            ->whereNull('kind')
            ->update(['kind' => 'session']);
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });
    }
};
