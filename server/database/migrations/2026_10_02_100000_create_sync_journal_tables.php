<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The journal of the sync between the owner's devices (#2031,
 * `docs/sync/protocol.md` § A journal entry). Two tables, with different
 * lives:
 *
 * - `sync_entries`: every entry this database has dealt with, its own writes
 *   and every entry a replay applied, found already true or turned into a
 *   conflict, with the ids it created here. It travels with the database:
 *   it is what makes a replay idempotent, and what `holds` reads.
 * - `sync_journal`: this device's kept entries, in full, until every other
 *   device holds them. A database keeps only its own device's journal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_entries', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('device', 16);
            // own | applied | already | conflict
            $table->string('outcome', 12);
            $table->text('created');
            $table->timestamp('recorded_at')->useCurrent();
            $table->index(['device', 'id']);
        });

        Schema::create('sync_journal', function (Blueprint $table): void {
            $table->string('id', 26)->primary();
            $table->string('device', 16);
            $table->string('at', 32);
            $table->string('method', 6);
            $table->string('route', 120);
            $table->text('params');
            $table->text('body')->nullable();
            $table->text('created');
            $table->text('before')->nullable();
            $table->index(['device', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_journal');
        Schema::dropIfExists('sync_entries');
    }
};
