<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The writes a rebase could not carry (#2031, PRD § 6.4): a write the rules
 * refuse on the other device's database, or one whose row changed or went
 * there since it was made. **Never dropped:** each waits for the owner, with
 * both sides. It travels with the database, as `sync_entries` does, so a
 * conflict the owner answered is never raised again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_conflicts', function (Blueprint $table): void {
            // The journal entry that could not be carried: one conflict each.
            $table->string('entry_id', 26)->primary();
            $table->string('device', 16);
            $table->string('route', 120);
            // refused | changed | gone | differs | failed | unknown-route
            $table->string('reason', 16);
            // Why, as the replay found it: the message, or the field and both values.
            $table->text('detail');
            // The write as it was replayed here, in this database's ids.
            $table->text('entry');
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamp('decided_at')->nullable();
            // theirs | mine | by-hand, once the owner answered (#2038).
            $table->string('decision', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_conflicts');
    }
};
