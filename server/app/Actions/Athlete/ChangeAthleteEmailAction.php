<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Actions\Account\RequestEmailChangeAction;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Owner-side email change on an athlete row (#476). Branches on the
 * athlete's lifecycle state so the SPA exposes a single entry point
 * while the server does the right thing for each state:
 *
 * **State A — no invitation, no `user_id`.**
 * Plain roster row, never connected to the auth side. Email is
 * just contact metadata; we update the column and return. No mail.
 *
 * **State B — pending invitation, `user_id === null`.**
 * The athlete has been invited but hasn't accepted. The active
 * invitation's link still points at the OLD email; leaving the
 * athlete row's email out of sync with the active invite would let
 * the wrong inbox redeem the credential. We revoke the active
 * invitation, swap the email on the athlete row, and send a fresh
 * invitation through `SendAthleteInvitationAction::execute` — a
 * brand new bearer credential delivered to the new address. Both
 * mutations are inside one DB transaction so a partial failure
 * (revoke succeeded, mail failed) doesn't leave a state where the
 * athletes table has the new email but no active invite.
 *
 * **State C — `user_id !== null`** (athlete logged in at least once).
 * Now the email change is a USER login-email change, same gravity
 * as the owner editing their own profile. We delegate to
 * `RequestEmailChangeAction::execute` against the linked user; the
 * pending-then-verify round-trip applies on confirm. We do NOT
 * touch `athletes.email` here — `ConfirmEmailChangeAction` syncs
 * both `users.email` and `athletes.email` atomically when the
 * athlete clicks the verify link, so this row stays as it is until
 * the new address is proven reachable.
 *
 * Returns a `mode` discriminator so the SPA can branch the toast
 * copy without a second round-trip:
 *
 * - `direct`       — state A; roster email mutated immediately
 * - `invite_swap`  — state B; old invite revoked, new one queued
 * - `pending`      — state C; verification mail queued, awaiting click
 */
class ChangeAthleteEmailAction
{
    public function __construct(
        private readonly SendAthleteInvitationAction $invitationAction,
        private readonly RequestEmailChangeAction $requestEmailChange,
    ) {
    }

    /**
     * @return array{mode: 'direct'|'invite_swap'|'pending'}
     */
    public function execute(User $sender, Athlete $athlete, string $newEmail): array
    {
        $normalized = mb_strtolower(trim($newEmail));

        // State C — linked user. The login email IS the athlete's auth
        // credential; pending-then-verify applies to keep the typo-
        // lockout + hijack-vector mitigations alive.
        if ($athlete->user_id !== null) {
            /** @var User|null $linked */
            $linked = User::query()->whereKey($athlete->user_id)->first();
            if ($linked === null) {
                // FK cascade should prevent this; defensive — if a
                // raw-SQL path orphans the link, fail loudly so the
                // owner sees an error instead of a silent no-op.
                throw ValidationException::withMessages([
                    'email' => 'linked_user_missing',
                ]);
            }

            $this->requestEmailChange->execute($linked, $normalized);

            return ['mode' => 'pending'];
        }

        // State B — pending invitation, no linked user yet. Atomic
        // revoke-and-swap so a queue blip doesn't leave a divergent
        // mid-state.
        $latestActive = $athlete->latestActiveInvitation;
        if ($latestActive !== null && $latestActive->isPending()) {
            DB::transaction(function () use ($athlete, $normalized, $latestActive): void {
                $this->invitationAction->revoke($latestActive);
                $athlete->forceFill(['email' => $normalized])->save();
            });

            // Refresh + re-issue OUTSIDE the transaction so the queue
            // dispatch happens after the row has been committed —
            // otherwise the worker could pick up the job before the
            // commit lands and read stale state.
            $this->invitationAction->execute($sender, $athlete->fresh() ?? $athlete);

            return ['mode' => 'invite_swap'];
        }

        // State A — plain roster row. Free edit, no mail.
        $athlete->forceFill(['email' => $normalized])->save();

        return ['mode' => 'direct'];
    }
}
