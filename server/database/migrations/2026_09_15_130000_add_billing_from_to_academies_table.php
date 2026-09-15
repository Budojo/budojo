<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The month this academy started recording fees in Budojo (#1742).
 *
 * The ledger had two floors and neither meant this. `athletes.joined_at` says
 * when a person started training; `academies.created_at` says when a row was
 * made. Neither says *"from this month, Budojo is where this academy's fees
 * are kept"* — so an academy that has existed since 2019 and adopted Budojo in
 * September 2026 showed, for every athlete, up to six seasons of amber "Non
 * pagato": seventy-odd months that were paid in cash years before the app
 * existed. **Absence of a payment record is not arrears**, and for every month
 * before adoption the ledger was asserting a debt it has no knowledge of.
 *
 * At the **academy**, not the athlete. The owner did not start tracking one
 * athlete in September; he started tracking the academy. A per-athlete column
 * is the same fact maintained sixty times, for a per-athlete exception nobody
 * has asked for — and because the floor resolves in one helper
 * (`App\Support\BillingFloor`), adding an override later is a change to that
 * helper and nothing else.
 *
 * **A date pinned to the 1st**, not a year/month pair: one column, one
 * comparison, and the existing `date` cast conventions apply. The day is never
 * read — `BillingFloor` reduces it to (year, month) — but storing a real date
 * keeps it printable and sortable without a second rule.
 *
 * **Nullable, and null means no floor**: the ledger behaves exactly as it did
 * before. That is what a restore from an older backup gets, and it must not
 * blank anybody's history.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded so the data half below stays reachable on a schema that
        // already has the column — it is the half that can silently do nothing.
        if (! Schema::hasColumn('academies', 'billing_from')) {
            Schema::table('academies', function (Blueprint $table): void {
                $table->date('billing_from')->nullable()->after('season_start_month');
            });
        }

        // Existing academies take the month they were created in. It is the
        // best evidence available for "when did this academy start keeping its
        // fees here", and it is the answer the owner would give. Anyone who
        // migrated a paper register backwards can move it on the academy form.
        //
        // Pinned to the 1st and written as `Y-m-d 00:00:00`, which is what
        // Eloquent's `date` cast stores — `DB::table()` applies no casts, and a
        // bare `Y-m-d` beside a cast-written value leaves two string shapes in
        // one column for SQLite to compare as text (see .claude/gotchas.md).
        //
        // In PHP rather than a `strftime()` expression: no other migration in
        // the repo depends on a driver's date functions, and one academy per
        // install is not a row count worth buying that with.
        DB::table('academies')
            ->select('id', 'created_at')
            ->whereNull('billing_from')
            ->orderBy('id')
            ->each(function (object $academy): void {
                $created = $academy->created_at !== null
                    ? Carbon::parse((string) $academy->created_at)
                    : Carbon::today();

                DB::table('academies')
                    ->where('id', $academy->id)
                    ->update(['billing_from' => $created->startOfMonth()->format('Y-m-d 00:00:00')]);
            });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('billing_from');
        });
    }
};
