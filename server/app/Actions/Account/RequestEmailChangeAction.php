<?php

declare(strict_types=1);

namespace App\Actions\Account;

use App\Mail\EmailChangeNotificationMail;
use App\Mail\EmailChangeVerificationMail;
use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Request an email change on a user account (#476). Used by both:
 *
 * - The owner self-edit path on `/dashboard/profile` → calls directly
 *   from `EmailChangeController::request()`.
 * - The athlete-detail state-C path → wrapped by
 *   `ChangeAthleteEmailAction::execute()` when the athlete has a
 *   linked `users` row.
 *
 * The action is **pending-then-verify**, NOT apply-then-verify:
 * `users.email` is left untouched here; the candidate lands on
 * `pending_email_changes`, two emails go out (verification to NEW,
 * notification to OLD), and the actual `users.email` write only
 * happens in `ConfirmEmailChangeAction` when the click confirms the
 * NEW address is reachable. Rationale:
 *
 * - **Typo lockout:** if the requester mistypes the new address, the
 *   live login email stays valid until the legitimate new-address
 *   owner confirms.
 * - **Hijack vector:** a compromised account could redirect login
 *   email to one the attacker controls and harvest password-reset
 *   tokens. The pending row + notification to OLD email gives the
 *   legitimate user a chance to react before the change applies.
 *
 * Validation rejections (both 422):
 *
 * - `email_taken` — the candidate is already a different user's email.
 *   We surface this loudly rather than silently accepting; otherwise
 *   the verify endpoint would 500 on a unique-violation at apply time.
 * - `email_unchanged` — the candidate equals the user's current email.
 *   Stops a no-op round-trip from spamming the user with two mails.
 *
 * Mail dispatch is best-effort (mirrors `RegisterUserAction` /
 * `SendAthleteInvitationAction`): a Mail::queue() failure is reported
 * but the pending row stands. The next click either succeeds (queue
 * came back) or the user re-requests the change.
 */
class RequestEmailChangeAction
{
    /**
     * Default expiry window for a verification token. 24 hours is the
     * conservative end of "long enough for the legitimate user to read
     * the email" while staying short enough that a stale link found in
     * an inbox months later cannot redeem.
     */
    public const int EXPIRY_HOURS = 24;

    public function execute(User $user, string $newEmail): PendingEmailChange
    {
        // Normalize before any compare. Strict-equals on case-sensitive
        // strings would let `Mario@Example.com` slip past an
        // `email_unchanged` check that the DB-level unique index then
        // refuses (MySQL collations are case-insensitive on email).
        $normalized = mb_strtolower(trim($newEmail));
        $current = mb_strtolower($user->email);

        if ($normalized === $current) {
            throw ValidationException::withMessages([
                'email' => 'email_unchanged',
            ]);
        }

        // Anti-collision: the candidate cannot already belong to a
        // different user. Same shape `SendAthleteInvitationAction`
        // uses for its anti-squatting check.
        $alreadyTaken = User::query()
            ->whereKey($user->id, '!=')
            ->whereRaw('LOWER(email) = ?', [$normalized])
            ->exists();
        if ($alreadyTaken) {
            throw ValidationException::withMessages([
                'email' => 'email_taken',
            ]);
        }

        // Generate the raw token + its hash. The raw is the only thing
        // that ever lands in user-visible content (email body); the
        // hash is what survives at rest. Same shape as
        // AthleteInvitation::hashToken().
        $rawToken = Str::random(64);
        $hash = PendingEmailChange::hashToken($rawToken);
        $now = now();
        $expiresAt = $now->copy()->addHours(self::EXPIRY_HOURS);

        // Atomic upsert on user_id — a second request from the same
        // user replaces the previous row (the previous raw token is
        // dropped on the floor and any link emitted earlier becomes
        // useless). One live bearer credential at a time. Lock on the
        // user row so concurrent requests serialise here; without the
        // lock the de-dupe is a TOCTOU window where two threads can
        // each see "no pending row" and both try to insert, only one
        // surviving the UNIQUE constraint with a noisy error.
        /** @var PendingEmailChange $pending */
        $pending = DB::transaction(function () use ($user, $normalized, $hash, $now, $expiresAt) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            return PendingEmailChange::query()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'new_email' => $normalized,
                    'token' => $hash,
                    'expires_at' => $expiresAt,
                    'requested_at' => $now,
                ],
            );
        });

        // Best-effort mail dispatch. Verification to NEW (the click is
        // the proof that the candidate is reachable), audit notice to
        // OLD (give the legitimate account-holder a chance to react if
        // this wasn't them).
        try {
            Mail::to($normalized)->queue(new EmailChangeVerificationMail(
                rawToken: $rawToken,
                userName: $user->name,
                expiresAt: $expiresAt,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        try {
            Mail::to($user->email)->queue(new EmailChangeNotificationMail(
                userName: $user->name,
                newEmailPartial: self::partialMask($normalized),
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $pending->fresh() ?? $pending;
    }

    /**
     * Partial mask for the new email shown in the OLD-email
     * notification body. Defence in depth: the old-address inbox is
     * the same one we suspect could be shoulder-surfed by a bad actor
     * waiting for the legitimate owner to react. Leaking the full
     * candidate would tell the attacker "yes, my redirect attempt
     * landed at j.doe@evil.com"; a partial mask still confirms "an
     * attempt was made" without confirming the full destination.
     *
     * - `j***@example.com`              for `john@example.com`
     * - `m***@b***.it`                   for `mario@budojo.it`
     */
    public static function partialMask(string $email): string
    {
        $atPos = strrpos($email, '@');
        if ($atPos === false || $atPos === 0) {
            // No `@` (shouldn't happen — validator catches it). Mask
            // everything past the first char defensively.
            return mb_substr($email, 0, 1) . '***';
        }

        $local = mb_substr($email, 0, $atPos);
        $domain = mb_substr($email, $atPos + 1);

        $maskedLocal = mb_substr($local, 0, 1) . '***';

        // Mask the domain too — only the TLD remains visible. The
        // SLD (`example` in `example.com`) leaks too much; the TLD
        // alone (`com`, `it`) confirms region-class without
        // identifying the provider.
        $dotPos = strrpos($domain, '.');
        if ($dotPos === false) {
            $maskedDomain = mb_substr($domain, 0, 1) . '***';
        } else {
            $maskedDomain = mb_substr($domain, 0, 1) . '***' . mb_substr($domain, $dotPos);
        }

        return $maskedLocal . '@' . $maskedDomain;
    }
}
