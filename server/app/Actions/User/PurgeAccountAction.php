<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Hard-deletes a user account and all academy + athlete data tied to
 * it (#223). Called by the scheduled cron after the grace period
 * elapses, OR directly in tests.
 *
 * Two phases, in this order:
 *
 *   1. **Collect** the disk paths that would be orphaned by the DB
 *      cascade (document files, academy logo).
 *   2. **DB transaction** — `$user->delete()` triggers the FK cascade
 *      chain (user → academy → athletes → payments, attendance,
 *      documents). All wired with `cascadeOnDelete()` at the
 *      migration level. Soft-deleted athletes get cleared via the FK
 *      cascade too.
 *   3. **Disk cleanup AFTER commit** — only the paths we collected
 *      are unlinked, and only once the DB transaction has succeeded.
 *
 * Why disk-after-DB and not interleaved: if the disk wipe ran inside
 * the transaction and `$user->delete()` then failed (deadlock, FK
 * blip, etc.), the DB would roll back but the files would already
 * be gone — irrecoverable. The reverse failure mode is recoverable:
 * if disk cleanup fails after a successful DB commit, we end up
 * with orphan files on disk that a maintenance script can later
 * collect. Strictly preferable to losing user data permanently in a
 * partial-success state.
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
        $pathsToWipe = $this->collectDiskPaths($user);

        DB::transaction(function () use ($user): void {
            // Deleting the user triggers the FK cascade chain (user →
            // academy → athletes → payments, attendance, documents).
            // All wired with `cascadeOnDelete()` at the migration
            // level. Soft-deleted athletes get cleared via the FK
            // cascade too.
            $user->delete();
        });

        foreach ($pathsToWipe as $path) {
            Storage::disk('local')->delete($path);
        }
    }

    /**
     * Walks the user's domain to find every file the FK cascade would
     * leave orphaned. Runs BEFORE the transaction so the result is a
     * plain `array` of strings — no Eloquent state survives the
     * subsequent `$user->delete()` call.
     *
     * Includes soft-deleted athletes via `withTrashed()` so a kid
     * who was removed from the roster six months ago still has their
     * medical certificate scrubbed from disk on account hard-delete.
     *
     * @return list<string>
     */
    private function collectDiskPaths(User $user): array
    {
        $paths = [];

        if ($user->academy === null) {
            return $paths;
        }

        $athletes = $user->academy->athletes()->withTrashed()->with('documents')->get();
        foreach ($athletes as $athlete) {
            foreach ($athlete->documents as $doc) {
                $paths[] = $doc->file_path;
            }
        }

        if (\is_string($user->academy->logo_path) && $user->academy->logo_path !== '') {
            $paths[] = $user->academy->logo_path;
        }

        return $paths;
    }
}
