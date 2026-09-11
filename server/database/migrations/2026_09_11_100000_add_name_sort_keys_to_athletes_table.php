<?php

declare(strict_types=1);

use App\Support\NameFold;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
     * **Written by the application, not derived by the database.** The first
     * version of this was a generated column — `GENERATED ALWAYS AS (…)
     * VIRTUAL` over a REPLACE chain, so nothing could ever write a stale key.
     * It worked, and it was the wrong shape: the chain is ~74 calls deep, and
     * SQLite's parser stack depth is a **compile-time constant**. The dev
     * container swallowed 120 levels; CI's build threw `parser stack overflow`
     * at 74 and took 1378 tests with it.
     *
     * That is not a CI problem to work around. The desktop app ships its own
     * bundled PHP, so the SQLite that runs this migration on an owner's machine
     * is whichever build went into the installer — and the failure mode is a
     * migration that throws on upgrade and an app that will not start. An
     * expression frozen into the schema has to be portable to every build of a
     * database we do not compile.
     *
     * So: ordinary columns, filled by `AthleteObserver::saving()` on every
     * write, backfilled here for the rows that already exist. The cost is a
     * write path that can drift; `AthleteNameCollationTest` is what holds it,
     * and the only way round the observer is a raw `DB::table('athletes')`
     * update touching a name — of which there are none today.
     */
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            // Nullable, because the backfill below runs after the column
            // exists and a NOT NULL with no default cannot be added to a
            // populated table. The observer never writes null afterwards.
            $table->string('first_name_sort')->nullable()->after('last_name');
            $table->string('last_name_sort')->nullable()->after('first_name_sort');

            // Composite and in this order because that is how the roster reads
            // them: surname leads, forename breaks the tie.
            $table->index(['last_name_sort', 'first_name_sort'], 'athletes_name_sort_index');
        });

        // Chunked and keyed by id, so a roster of any size migrates in bounded
        // memory. `DB::table` rather than the model on purpose: the observer
        // is not needed here (this IS the fold) and an Eloquent save would fire
        // the promotion and audit observers for a write that changes nothing a
        // reader would recognise.
        DB::table('athletes')
            ->select(['id', 'first_name', 'last_name'])
            ->orderBy('id')
            ->chunk(500, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('athletes')->where('id', $row->id)->update([
                        'first_name_sort' => NameFold::fold((string) $row->first_name),
                        'last_name_sort' => NameFold::fold((string) $row->last_name),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropIndex('athletes_name_sort_index');
            $table->dropColumn(['first_name_sort', 'last_name_sort']);
        });
    }
};
