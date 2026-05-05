<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add `users.role` to discriminate the two product personas (#445):
 *
 * - `owner` — academy owners / managers. Default for every existing
 *   row + every new public-register row. Backwards compatible: nothing
 *   pre-M7 needs to change.
 * - `athlete` — created exclusively via the token-signed invite flow
 *   landing in M7 PR-C. There is no migration path from the public
 *   register endpoint to this role.
 *
 * Stored as a string column rather than a native MySQL ENUM so a
 * future third role (e.g. `coach`) can land without an `ALTER TABLE`
 * — same trade-off `support_tickets.category` already makes.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('role', 32)->default('owner')->after('password');
        });

        // Belt-and-braces backfill — every pre-existing row predates M7
        // by definition and is an owner. The column default already
        // covers fresh inserts; this UPDATE is a safety net against the
        // (theoretical) case where the default lands stale.
        DB::table('users')->whereNull('role')->update(['role' => 'owner']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('role');
        });
    }
};
