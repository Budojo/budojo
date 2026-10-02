<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;

/**
 * A stray migration name the sync takes (#2083, `SyncDatabase::STRAY_MIGRATIONS`)
 * must also migrate cleanly once it is in: the phone runs the migrations after
 * every swap.
 */
it('runs the renamed support-tickets migration on a database that already has the table, as one that ran it under its old name has', function (): void {
    expect(Schema::hasTable('support_tickets'))->toBeTrue();
    $migration = require database_path('migrations/2026_05_05_120001_create_support_tickets_table.php');

    $migration->up();

    expect(Schema::hasTable('support_tickets'))->toBeTrue();
});
