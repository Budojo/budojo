<?php

declare(strict_types=1);

use App\Enums\MartialArt;
use App\Support\MartialArt\AgeDivision;
use App\Support\MartialArt\Grade;
use App\Support\MartialArt\MartialArtProfile;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Whether the academy trains kids (#1651).
 *
 * An academy with no kids' programme skipped the youth belts on every belt
 * pick — four in BJJ, the half belts in judo and karate, the poom in
 * taekwondo. The flag trims the SPA's pickers and filters; the server does not
 * enforce it.
 *
 * **Off on a new academy**, as the issue asks: an owner who trains kids says
 * so once on the academy page.
 *
 * **Derived for the academies that exist**, not defaulted. An academy already
 * holding a kid — an athlete on a youth grade of its own art, or one young
 * enough for its federation's kids' divisions this calendar year — keeps
 * every belt it had. Soft-deleted athletes count: restoring one should not
 * bring back a belt the pickers no longer offer. The data half only ever sets
 * the flag on, so running it twice changes nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded so the data half stays reachable on a schema that already
        // has the column — the half that can silently do nothing.
        if (! Schema::hasColumn('academies', 'trains_kids')) {
            Schema::table('academies', function (Blueprint $table): void {
                $table->boolean('trains_kids')->default(false);
            });
        }

        $thisYear = Carbon::now()->year;

        DB::table('academies')
            ->select('id', 'martial_art')
            ->where('trains_kids', false)
            ->orderBy('id')
            ->each(function (object $academy) use ($thisYear): void {
                $art = MartialArt::tryFrom((string) ($academy->martial_art ?? 'bjj')) ?? MartialArt::Bjj;
                $profile = MartialArtProfile::for($art);

                $youthBelts = array_values(array_map(
                    static fn (Grade $grade): string => $grade->belt->value,
                    array_filter($profile->ladder()->grades(), static fn (Grade $grade): bool => $grade->kids),
                ));
                $kidsUpTo = max(array_map(
                    static fn (AgeDivision $division): int => $division->max ?? 0,
                    array_filter($profile->ageDivisions(), static fn (AgeDivision $division): bool => $division->category === 'kids'),
                ) ?: [0]);

                $holdsAKid = DB::table('athletes')
                    ->where('academy_id', $academy->id)
                    ->where(fn ($q) => $q
                        ->whereIn('belt', $youthBelts)
                        // Age as the federations count it: the one reached
                        // this calendar year. `date_of_birth` is stored
                        // `Y-m-d…`, so the year is its first four characters.
                        ->orWhereRaw('CAST(substr(date_of_birth, 1, 4) AS INTEGER) >= ?', [$thisYear - $kidsUpTo]))
                    ->exists();

                if ($holdsAKid) {
                    DB::table('academies')->where('id', $academy->id)->update(['trains_kids' => true]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('trains_kids');
        });
    }
};
