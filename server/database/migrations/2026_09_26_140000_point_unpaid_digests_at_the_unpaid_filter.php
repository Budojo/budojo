<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The unpaid digest linked to `/dashboard/athletes?paid=0`, and the roster
 * reads `paid=yes|no`, so every one already in an inbox opened the whole
 * roster instead of the athletes who have not paid (#1913). New digests carry
 * `paid=no`; this points the ones already written at the same place.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('notifications')
            ->where('data->kind', 'unpaid_athletes_digest')
            ->where('data->link', '/dashboard/athletes?paid=0')
            ->update(['data->link' => '/dashboard/athletes?paid=no']);
    }

    public function down(): void
    {
        // Nothing to undo: `paid=0` never filtered anything.
    }
};
