<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Actions\Address\SyncAddressAction;
use App\Models\Academy;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateAcademyAction
{
    public function __construct(
        private readonly SyncAddressAction $syncAddress,
    ) {
    }

    /**
     * @param  list<int>|null            $trainingDays  Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured"
     * @param  array<string, mixed>|null $address       Validated address payload (#72), or null for none.
     */
    public function execute(
        User $user,
        string $name,
        ?array $address = null,
        ?array $trainingDays = null,
    ): Academy {
        // Both writes (academy + morph address) belong to the same logical
        // creation step — wrap them so a failed address insert rolls back
        // the academy row, instead of leaving a half-created academy with
        // no address that the user can't recover.
        return DB::transaction(function () use ($user, $name, $address, $trainingDays): Academy {
            $academy = Academy::create([
                'user_id' => $user->id,
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'training_days' => $trainingDays,
            ]);

            // Schedule history (#1094). Seed the brand-new academy's
            // history with one row carrying the same `training_days`,
            // effective today. Without this, new academies created via
            // POST start with empty `schedules` and `currentSchedule()`
            // returns null — the migration's backfill only covers rows
            // that already existed. `effective_from = today` matches
            // the natural reading: "this is what the schedule is, as
            // of when the academy was created".
            $academy->schedules()->create([
                'training_days' => $trainingDays,
                'effective_from' => Carbon::today(),
            ]);

            if ($address !== null) {
                $this->syncAddress->execute($academy, $address);
            }

            return $academy;
        });
    }

    private function uniqueSlug(string $name): string
    {
        return Str::slug($name) . '-' . Str::lower(Str::random(8));
    }
}
