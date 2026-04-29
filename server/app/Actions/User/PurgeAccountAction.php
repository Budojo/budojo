<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\Athlete;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Hard-deletes a user account and all academy + athlete data tied to
 * it (#223). Called by the scheduled cron after the grace period
 * elapses, OR directly in tests.
 *
 * Cascade order matters: documents have files on the local disk that
 * the FK cascade does NOT clean up. We walk the athletes (including
 * soft-deleted ones via `withTrashed()`) and `Storage::delete` each
 * document file BEFORE hard-deleting the rows. Subsequent FK cascades
 * (academy → athletes → payments → attendance → documents) clear the
 * DB rows in one transaction.
 *
 * **Scope note (#223):** payments inherit the athlete's
 * `cascadeOnDelete()` — they are wiped along with the athlete here,
 * which is the right thing for GDPR Art. 17 but loses the fiscal
 * retention angle. A follow-up migration will make `athlete_id`
 * nullable on `athlete_payments` plus snapshot the athlete name
 * inline; this Action will then anonymise instead of cascade-delete.
 * Until then the user's grace window + the `/me/export` endpoint
 * (#222) are how they preserve a copy of their fiscal record.
 */
class PurgeAccountAction
{
    public function execute(User $user): void
    {
        $user->loadMissing(['academy.athletes' => fn ($q) => $q->withTrashed()]);

        DB::transaction(function () use ($user): void {
            // Phase 1 — disk cleanup. The FK cascade does NOT touch
            // files; we have to walk them ourselves before the rows
            // are gone.
            if ($user->academy !== null) {
                /** @var \Illuminate\Database\Eloquent\Collection<int, Athlete> $athletes */
                $athletes = $user->academy->athletes()->withTrashed()->with('documents')->get();
                foreach ($athletes as $athlete) {
                    foreach ($athlete->documents as $doc) {
                        Storage::disk('local')->delete($doc->file_path);
                    }
                }

                // Academy logo lives at `academies.logo_path` on the
                // local disk. Wipe that too before the academy row goes.
                if (\is_string($user->academy->logo_path) && $user->academy->logo_path !== '') {
                    Storage::disk('local')->delete($user->academy->logo_path);
                }
            }

            // Phase 2 — DB cascade. Deleting the user triggers the
            // FK cascade chain: user → academy → athletes → (payments,
            // attendance_records, documents). All wired with
            // `cascadeOnDelete()` at the migration level.
            $user->delete();
        });
    }
}
