<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateAcademyAction
{
    public function __construct(
        private readonly SyncAcademyAddressAction $syncAddress,
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
