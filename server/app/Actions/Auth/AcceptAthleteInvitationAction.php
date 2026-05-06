<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Enums\UserRole;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\NewAccessToken;

/**
 * Consume an athlete invitation (#445, M7 PR-C).
 *
 * Counterpart to `SendAthleteInvitationAction` (PR-B). The athlete
 * clicks the signed link in their email; the SPA POSTs the raw token
 * + chosen password here. The action:
 *
 * 1. Hashes the raw token and looks up the row by hash.
 * 2. Validates the row is pending (not accepted, not revoked, not
 *    expired) — pairwise mutually exclusive with the four state
 *    helpers on the model, so the check is one `isPending()` call.
 * 3. Defends against the email-already-registered race window — even
 *    though PR-B refuses to invite squatted emails, the email could
 *    have been claimed by a public `/register` between invite-send
 *    and invite-accept.
 * 4. Creates the `User` row inside a transaction, links
 *    `athletes.user_id`, marks `accepted_at`, issues a Sanctum token.
 *    The token IS the email proof, so `email_verified_at` is set
 *    immediately — there is no second-step verification email for
 *    invited athletes (the M5 verify-email gate is owner-side only).
 *
 * Idempotency: a second POST with the same raw token returns 422
 * with `errors.token: invite_already_accepted`, NOT 500. Laravel
 * collapses ValidationException to a 422 — the accepted row is still
 * in the DB but no longer redeemable, and the SPA renders the
 * dedicated friendly error page off the `invite_already_accepted`
 * code (clicking the email link twice is a UX accident, not a bug).
 */
class AcceptAthleteInvitationAction
{
    /**
     * @return array{user: User, token: NewAccessToken, invitation: AthleteInvitation}
     */
    public function execute(string $rawToken, string $password): array
    {
        $hash = AthleteInvitation::hashToken($rawToken);

        /** @var AthleteInvitation|null $invitation */
        $invitation = AthleteInvitation::query()
            ->where('token', $hash)
            ->first();

        // Token unknown — return the same generic error as accepted /
        // revoked / expired so a stranger probing the endpoint doesn't
        // learn whether ANY token they tried existed.
        if ($invitation === null) {
            $this->failWithInvalidToken();
        }

        if ($invitation->isAccepted()) {
            throw ValidationException::withMessages([
                'token' => 'invite_already_accepted',
            ]);
        }

        if ($invitation->isRevoked()) {
            throw ValidationException::withMessages([
                'token' => 'invite_revoked',
            ]);
        }

        if ($invitation->isExpired()) {
            throw ValidationException::withMessages([
                'token' => 'invite_expired',
            ]);
        }

        // The race-window guard + the user-create + the athlete-link
        // + the invitation-accept all run under one transaction with
        // a row-level lock on the invitation itself. The lock
        // serialises concurrent accept calls for the SAME token; the
        // email-exists re-check inside the transaction closes the
        // race-window where a public /register lands between the
        // outer pre-checks and the create. The unique constraint on
        // users.email is the final backstop — if a UniqueConstraint
        // violation surfaces despite the in-transaction check (DB-
        // level race), we surface it as the same friendly 422 error
        // code instead of bubbling a 500.
        try {
            return DB::transaction(function () use ($invitation, $password): array {
                $lockedInvitation = AthleteInvitation::query()
                    ->whereKey($invitation->id)
                    ->lockForUpdate()
                    ->first();
                \assert($lockedInvitation !== null);

                // Re-validate state inside the lock — another concurrent
                // accept could have set accepted_at after our pre-check.
                if (! $lockedInvitation->isPending()) {
                    throw ValidationException::withMessages([
                        'token' => $lockedInvitation->isAccepted()
                            ? 'invite_already_accepted'
                            : ($lockedInvitation->isRevoked() ? 'invite_revoked' : 'invite_expired'),
                    ]);
                }

                if (User::query()->where('email', $lockedInvitation->email)->exists()) {
                    throw ValidationException::withMessages([
                        'email' => 'email_already_registered',
                    ]);
                }

                $athlete = $lockedInvitation->athlete()->lockForUpdate()->first();
                \assert($athlete !== null);

                // `email_verified_at` is intentionally outside of Fillable
                // on User (the standard registration flow proves email
                // ownership via the M5 verify-email link, not via mass
                // assignment). For the invite-accept flow, the token in
                // the URL IS the email proof, so we set it directly via
                // forceFill in a separate save.
                $user = new User();
                $user->forceFill([
                    'name' => trim($athlete->first_name . ' ' . $athlete->last_name),
                    'email' => $lockedInvitation->email,
                    'password' => $password,
                    'email_verified_at' => now(),
                    'terms_accepted_at' => now(),
                    'role' => UserRole::Athlete,
                ])->save();

                $athlete->forceFill(['user_id' => $user->id])->save();

                $lockedInvitation->forceFill(['accepted_at' => now()])->save();

                $token = $user->createToken('athlete-invite-accept');

                return [
                    'user' => $user->fresh() ?? $user,
                    'token' => $token,
                    'invitation' => $lockedInvitation->fresh() ?? $lockedInvitation,
                ];
            });
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            // Final backstop for the email-already-registered race. If
            // the in-transaction `exists()` check missed (DB-level race
            // window, e.g. SQLite serialisable-read sub-millisecond
            // timing), the unique users.email index throws — surface
            // the same friendly error code instead of a 500.
            throw ValidationException::withMessages([
                'email' => 'email_already_registered',
            ]);
        }
    }

    /**
     * Resolve a raw token to a preview snapshot for the SPA pre-fill.
     * Public endpoint (no auth) — the token IS the auth. Returns null
     * when the token is unknown / revoked / expired so the SPA can
     * render the friendly error page; accepted invites also resolve
     * to null so the SPA points the user at the sign-in page instead.
     */
    public function preview(string $rawToken): ?AthleteInvitation
    {
        $hash = AthleteInvitation::hashToken($rawToken);

        /** @var AthleteInvitation|null $invitation */
        $invitation = AthleteInvitation::query()
            ->with(['athlete', 'academy'])
            ->where('token', $hash)
            ->first();

        if ($invitation === null || ! $invitation->isPending()) {
            return null;
        }

        return $invitation;
    }

    /**
     * @phpstan-return never
     */
    private function failWithInvalidToken(): void
    {
        throw ValidationException::withMessages([
            'token' => 'invite_invalid',
        ]);
    }
}
