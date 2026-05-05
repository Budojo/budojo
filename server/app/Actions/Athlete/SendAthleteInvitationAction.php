<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Mail\AthleteInvitationMail;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Send (or re-send) an invitation to an athlete to log into the SPA
 * (#445, M7 PR-B). Distinct from `AcceptAthleteInvitationAction` (PR-C)
 * which consumes the invite. This action ALWAYS produces a side-effect:
 * either creates a new pending row + queues the mail, or — when a
 * pending row already exists for the athlete — refreshes its expiry +
 * mints a fresh raw token (replacing the stored hash) and queues the
 * mail again. Resending invalidates any URL emitted on a prior send;
 * the latest email is always the one that works. We pick this trade-
 * off deliberately: it removes a footgun where a token leaked from an
 * old email keeps working forever, and it's the same shape Laravel's
 * built-in password-reset flow uses.
 *
 * The action enforces the three V1 hard rules from the PRD:
 *
 * 1. The athlete must have an email on file. Without one we cannot
 *    deliver an invite. 422 with `email_missing`.
 * 2. The athlete's email must NOT already be a `User`. Anti-squatting
 *    boundary — accepting an invite for an email that's already a user
 *    would either trigger a unique-constraint violation OR (worse)
 *    silently create a second account that an attacker could redeem.
 *    422 with `email_already_registered`.
 * 3. Best-effort mail dispatch. If `Mail::queue(...)` blows up the row
 *    still lands and we `report()` so a recurring failure surfaces.
 *    Mirrors `RegisterUserAction` and `SubmitSupportTicketAction`.
 */
class SendAthleteInvitationAction
{
    /**
     * Default expiry window for an invitation. 7 days mirrors the
     * password-reset token shape (Laravel default 60 minutes is too
     * short here — we want the athlete to read the email at their
     * own pace). The action sets the actual value so a future
     * config-driven window is one edit away.
     */
    public const int EXPIRY_DAYS = 7;

    /**
     * @return array{invitation: AthleteInvitation, rawToken: string}
     *
     * Returns the invitation row plus the raw URL-safe token. The raw
     * is the only credential the athlete will ever see (it lands in
     * the email body); the DB column carries the SHA-256 hash via
     * `AthleteInvitation::hashToken()`.
     */
    public function execute(User $sender, Athlete $athlete): array
    {
        $email = $athlete->email;
        if ($email === null || $email === '') {
            throw ValidationException::withMessages([
                'email' => 'email_missing',
            ]);
        }

        // Anti-squatting: refuse to invite an email that's already a
        // Budojo account. Either it's the same person who already
        // self-registered as an owner (different persona; can't be
        // both in V1), or it's a different person who got there first.
        // Either way the invite would be unredeemable, so fail loudly
        // up-front instead of producing a dangling row.
        if (User::query()->where('email', $email)->exists()) {
            throw ValidationException::withMessages([
                'email' => 'email_already_registered',
            ]);
        }

        // Re-use a pending invite if one exists. The owner clicking
        // "Invita" twice on the same athlete must NOT spawn two live
        // tokens — that doubles the bearer-credential surface. The
        // read+write pair is wrapped in a transaction with a row lock
        // on the parent athlete so two concurrent requests serialise
        // through the same `pending()->first()` lookup; without the
        // lock the de-dupe is a TOCTOU window where both threads can
        // see "no pending row" and both create one.
        $rawToken = Str::random(64);
        $hash = AthleteInvitation::hashToken($rawToken);
        $now = now();

        /** @var AthleteInvitation $invitation */
        $invitation = DB::transaction(function () use ($athlete, $email, $hash, $now, $sender) {
            // The lock is on the athlete row — concurrent invite
            // requests for the SAME athlete serialise here. Different
            // athletes proceed in parallel because the lock scope is
            // a single row.
            Athlete::query()->whereKey($athlete->id)->lockForUpdate()->first();

            /** @var AthleteInvitation|null $existing */
            $existing = AthleteInvitation::query()
                ->where('athlete_id', $athlete->id)
                ->pending()
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                $existing->forceFill([
                    'token' => $hash,
                    'expires_at' => $now->copy()->addDays(self::EXPIRY_DAYS),
                    'last_sent_at' => $now,
                    // Snapshot email again — the athlete may have
                    // changed their email on the roster between the
                    // first send and the resend; we always email the
                    // current address.
                    'email' => $email,
                    'sent_by_user_id' => $sender->id,
                ])->save();

                return $existing;
            }

            return AthleteInvitation::query()->create([
                'athlete_id' => $athlete->id,
                'academy_id' => $athlete->academy_id,
                'sent_by_user_id' => $sender->id,
                'email' => $email,
                'token' => $hash,
                'expires_at' => $now->copy()->addDays(self::EXPIRY_DAYS),
                'last_sent_at' => $now,
            ]);
        });

        // Eager-fetch the academy name through the relation. The FK
        // (athletes.academy_id) is non-nullable, so the relation
        // always resolves at runtime; assert narrows phpstan's view.
        $academy = $athlete->academy;
        \assert($academy !== null);
        $academyName = $academy->name;

        try {
            Mail::to($email)->queue(new AthleteInvitationMail(
                rawToken: $rawToken,
                athleteName: trim($athlete->first_name . ' ' . $athlete->last_name),
                academyName: $academyName,
                ownerName: $sender->name,
                expiresAt: $invitation->expires_at,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return [
            'invitation' => $invitation->fresh() ?? $invitation,
            'rawToken' => $rawToken,
        ];
    }

    /**
     * Revoke a pending invitation. Does not delete the row — sets
     * `revoked_at` so the audit trail survives. Idempotent: revoking
     * an already-revoked / accepted / expired invite is a no-op.
     */
    public function revoke(AthleteInvitation $invitation): AthleteInvitation
    {
        if ($invitation->isPending()) {
            $invitation->forceFill(['revoked_at' => now()])->save();
        }

        return $invitation->fresh() ?? $invitation;
    }
}
