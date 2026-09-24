<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An index on `carnet_entries.carnet_id` (#1722).
 *
 * The foreign key never made one: SQLite does not index a referencing column
 * on its own, and the entity doc said it did. It did not matter while the
 * only reader was `withCount('entries')` over one athlete's carnets. It does
 * now, because "who owes this month" asks for every athlete's spendable
 * carnet, and the balance half of that is a count of entries per carnet on the
 * screen the owner opens most.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carnet_entries', function (Blueprint $table): void {
            $table->index('carnet_id');
        });
    }

    public function down(): void
    {
        Schema::table('carnet_entries', function (Blueprint $table): void {
            $table->dropIndex(['carnet_id']);
        });
    }
};
