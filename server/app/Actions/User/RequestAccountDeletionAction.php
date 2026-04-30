<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\PendingDeletion;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * GDPR-Art-17 grace-period entry (#223). Verifies the user's password
 * (re-auth gate so an absent-minded tap on a forgotten device cannot
 * trigger this) and, on success, inserts a `pending_deletions` row
 * with a 30-day window. The corresponding `PurgeAccountAction`
 * (scheduled task, see issue body) does the actual hard-delete after
 * the window elapses.
 *
 * Idempotent: a second call by the same user while a row already
 * exists returns the existing row instead of duplicating. (`user_id`
 * is unique on the table so a second insert would error anyway —
 * we'd rather hand back the canonical row.)
 */
class RequestAccountDeletionAction
{
    public const GRACE_DAYS = 30;

    /**
     * @throws ValidationException when the password does not match.
     */
    public function execute(User $user, string $password): PendingDeletion
    {
        if (! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'password' => 'The password is incorrect.',
            ]);
        }

        // Idempotent: re-running the request must NOT extend the grace
        // window (that would be a way for a malicious caller to
        // indefinitely defer the actual purge). `firstOrCreate` keyed
        // on `user_id` (which is unique on the table) is race-safe —
        // two concurrent POSTs cannot both win the create. If one of
        // them loses the race, the loser falls back to the existing
        // row instead of trapping the unique-constraint violation as
        // a 500.
        $now = Carbon::now();

        return PendingDeletion::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'requested_at' => $now,
                'scheduled_for' => $now->copy()->addDays(self::GRACE_DAYS),
                'confirmation_token' => Str::random(64),
            ],
        );
    }
}
