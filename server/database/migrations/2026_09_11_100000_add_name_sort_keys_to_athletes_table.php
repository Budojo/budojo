<?php

declare(strict_types=1);

use App\Support\NameFold;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The folded twin of each name column (#1527).
     *
     * The roster orders and searches names through SQLite's default BINARY
     * collation, which compares code points: `da Silva` sorts after `Zanetti`
     * because `d` is above `Z`, and `Ângelo` sorts after both. Three of the
     * most common surnames in Brazilian jiu jitsu were at the bottom of every
     * list, and typing `angelo` found nobody. See `App\Support\NameFold`.
     *
     * **Generated, not written.** SQLite derives these from the source column
     * on read, so there is no observer, no mutator and no backfill — and no
     * way for a name and its sort key to disagree. The import path, the athlete
     * form and a direct `DB::table()->update()` all get a correct key for free.
     *
     * **VIRTUAL, not STORED.** SQLite refuses `ALTER TABLE ADD COLUMN` for a
     * stored generated column; only virtual ones can be added to a table that
     * already exists. Virtual means computed per read, which an index makes
     * moot — the index below stores the computed value, and the query plan for
     * an ordered roster reads `SCAN athletes USING INDEX`.
     */
    public function up(): void
    {
        // Raw, because Laravel's schema builder has no vocabulary for a
        // generated column on SQLite, and because the expression is 1.1 KB of
        // nested REPLACE that belongs in one place rather than smeared across
        // a fluent chain.
        foreach (['first_name', 'last_name'] as $column) {
            $expression = NameFold::sqlExpression($column);

            DB::statement(
                "ALTER TABLE athletes ADD COLUMN {$column}_sort TEXT GENERATED ALWAYS AS ({$expression}) VIRTUAL"
            );
        }

        Schema::table('athletes', function ($table): void {
            // Composite and in this order because that is how the roster reads
            // them: surname leads, forename breaks the tie. The reverse cycle
            // (`sort_by=first_name`) scans instead, which is the right trade
            // for a list of a few hundred rows paginated at twenty.
            $table->index(['last_name_sort', 'first_name_sort'], 'athletes_name_sort_index');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function ($table): void {
            $table->dropIndex('athletes_name_sort_index');
        });

        foreach (['first_name', 'last_name'] as $column) {
            DB::statement("ALTER TABLE athletes DROP COLUMN {$column}_sort");
        }
    }
};
