<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\LicenseStatus;

/**
 * The licence question, answered (#1290): what state is this instance in, and
 * how long has it got?
 *
 * Pure — it takes the trial start, the verified key (if any) and "now", and
 * computes. No database, no clock of its own, no config lookup, so every edge
 * (the day the trial ends, an expired key, a key that outlives the trial) is a
 * plain unit test rather than a scenario someone has to stage.
 */
final class LicenseState
{
    public const int TRIAL_DAYS = 14;

    private function __construct(
        public readonly LicenseStatus $status,
        /** Days left before writes stop; 0 once expired. Null when licensed perpetually. */
        public readonly ?int $daysRemaining,
        public readonly ?string $licensee,
        public readonly ?\DateTimeImmutable $expiresAt,
    ) {
    }

    /**
     * @param \DateTimeImmutable $trialStartedAt when the account was created — the
     *                                           trial follows the account, so
     *                                           reinstalling the app does not
     *                                           hand out a fresh fortnight
     */
    public static function evaluate(
        \DateTimeImmutable $trialStartedAt,
        ?LicenseKey $license,
        \DateTimeImmutable $now,
    ): self {
        if ($license !== null) {
            if ($license->hasExpired($now)) {
                return new self(LicenseStatus::Expired, 0, $license->licensee, $license->expiresAt);
            }

            return new self(
                LicenseStatus::Active,
                self::daysUntil($license->expiresAt, $now),
                $license->licensee,
                $license->expiresAt,
            );
        }

        $trialEndsAt = $trialStartedAt->modify('+' . self::TRIAL_DAYS . ' days');

        if ($trialEndsAt <= $now) {
            return new self(LicenseStatus::Expired, 0, null, $trialEndsAt);
        }

        return new self(LicenseStatus::Trial, self::daysUntil($trialEndsAt, $now), null, $trialEndsAt);
    }

    /**
     * The state of an instance that cannot be licensed at all — a build with no
     * public key to verify against, or a runtime where licensing does not apply.
     *
     * It reports Active with no countdown, which is exactly how such an
     * instance behaves. The alternative — a fourth status — would force every
     * caller to handle a case whose only correct answer is "carry on".
     */
    public static function unenforced(): self
    {
        return new self(LicenseStatus::Active, null, null, null);
    }

    public function allowsWrites(): bool
    {
        return $this->status->allowsWrites();
    }

    /**
     * Days remaining, rounded UP: with eleven hours left the honest answer to
     * "how many days?" is one, not zero. Null for a key with no expiry.
     */
    private static function daysUntil(?\DateTimeImmutable $deadline, \DateTimeImmutable $now): ?int
    {
        if ($deadline === null) {
            return null;
        }

        $seconds = $deadline->getTimestamp() - $now->getTimestamp();

        return $seconds <= 0 ? 0 : (int) ceil($seconds / 86400);
    }
}
