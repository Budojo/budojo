<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * #72 — Replace the freeform `academies.address` text column with a
     * polymorphic `addresses` table. The polymorphic shape lets us attach
     * the same address structure to athletes, instructors, or any future
     * entity without duplicating schema; the cost is no DB-level FK
     * constraint to the owner (Eloquent's `morphTo` carries that integrity).
     *
     * All structured fields are nullable in the schema so the migration can
     * survive the legacy backfill (a freeform string with no city / postal
     * code parsed out). Application-level validation (`UpdateAcademyRequest`,
     * `StoreAcademyRequest`) enforces completeness on every WRITE — DB
     * permissive, API strict.
     */
    public function up(): void
    {
        Schema::create('addresses', function (Blueprint $table): void {
            $table->id();

            // Composite morph key (#72) — declared manually instead of
            // through Laravel's `morphs()` because we need a UNIQUE
            // composite index, not the regular one `morphs()` would emit.
            // Uniqueness on `(addressable_type, addressable_id)` is what
            // enforces the 1:1 invariant — without it, `morphOne` is just
            // a "first row wins" hint and concurrent writes can leave
            // duplicates. The unique index doubles as the lookup index
            // (same column order, same selectivity), so there's no need
            // for a second non-unique copy.
            $table->string('addressable_type');
            $table->unsignedBigInteger('addressable_id');
            $table->unique(['addressable_type', 'addressable_id'], 'addresses_addressable_unique');

            // Free-text street + civic. 255 covers any realistic line; we
            // don't try to split into "street name" + "number" because that
            // structure isn't universal across countries.
            $table->string('line1', 255)->nullable();
            $table->string('line2', 255)->nullable();

            // City stays a free string — there's no global enum of city
            // names, and Italian comuni alone are ~8000 entries. Validation
            // owns the trim + max length.
            $table->string('city', 100)->nullable();

            // Postal code is country-specific. 20 chars covers the longest
            // formats (Brazilian CEP, UK postcodes with space). For IT it's
            // 5 digits.
            $table->string('postal_code', 20)->nullable();

            // ISO 3166-2 sub-region (the "RM", "MI", "TO" codes). Nullable
            // because not every country uses province subdivisions in
            // addresses; required at the API layer when country=IT.
            $table->string('province', 5)->nullable();

            // ISO 3166-1 alpha-2. Default IT — the only country we support
            // today, and the most common path. The column is required (NOT
            // NULL) because every address belongs to SOME country, even if
            // the structured details are missing.
            $table->string('country', 2)->default('IT');

            $table->timestamps();
        });

        // Backfill — preserve any freeform academy address by dumping it
        // into `line1`. The other structured fields stay null until the
        // user re-enters; the next academy edit will surface "incomplete"
        // and force the user through the structured form.
        $rows = DB::table('academies')->whereNotNull('address')->get(['id', 'address']);
        foreach ($rows as $row) {
            $line1 = is_string($row->address) ? trim($row->address) : '';
            if ($line1 === '') {
                continue;
            }
            DB::table('addresses')->insert([
                'addressable_type' => \App\Models\Academy::class,
                'addressable_id' => (int) $row->id,
                'line1' => $line1,
                'country' => 'IT',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('address');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->string('address', 500)->nullable()->after('slug');
        });

        // Best-effort recompose for rollback — concatenate the structured
        // fields back into a single line. Anything not present stays out.
        $rows = DB::table('addresses')
            ->where('addressable_type', \App\Models\Academy::class)
            ->get();
        foreach ($rows as $row) {
            $parts = array_filter([
                $row->line1,
                $row->line2,
                $row->postal_code,
                $row->city,
                $row->province ? "({$row->province})" : null,
                $row->country !== 'IT' ? $row->country : null,
            ], static fn ($p) => is_string($p) && trim($p) !== '');

            DB::table('academies')
                ->where('id', $row->addressable_id)
                ->update(['address' => implode(', ', $parts)]);
        }

        Schema::dropIfExists('addresses');
    }
};
