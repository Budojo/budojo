<?php

declare(strict_types=1);

namespace App\Actions\License;

use App\Models\License;
use App\Models\User;
use App\Support\LicenseKey;
use App\Support\LicensePublicKey;
use App\Support\LicenseState;

/**
 * Where this instance stands with its licence, right now (#1290).
 *
 * The decision itself is pure and lives in `LicenseState`; this Action is the
 * adapter that gathers what the decision needs — the configured public key, the
 * most recently activated key, and when the first account was created.
 */
class GetLicenseStateAction
{
    public function execute(): LicenseState
    {
        $publicKey = LicensePublicKey::raw();

        // Fail OPEN, deliberately. A build with no public key cannot tell a
        // genuine key from a forged one, so it has nothing to enforce with.
        // Refusing every customer's writes because a build-time variable was
        // missing is a far worse failure than nobody being asked to activate.
        if ($publicKey === null) {
            return LicenseState::unenforced();
        }

        $now = now()->toDateTimeImmutable();

        return LicenseState::evaluate($this->trialStartedAt($now), $this->activeKey($publicKey), $now);
    }

    /**
     * The most recent activation that still verifies.
     *
     * A row that fails verification is treated as no licence at all: it means
     * the key was signed by a different keypair or the file was edited by hand,
     * and neither is something to extend trust to.
     */
    private function activeKey(string $publicKey): ?LicenseKey
    {
        $license = License::query()
            ->orderByDesc('activated_at')
            // Two activations inside the same second would otherwise tie, and
            // "whichever the database felt like" is not an answer.
            ->orderByDesc('id')
            ->first();

        return $license === null ? null : LicenseKey::verify($license->key, $publicKey);
    }

    /**
     * The trial runs from the first account, not from first launch: reinstalling
     * the app — or pointing it at a fresh data directory — must not hand out
     * another free fortnight.
     */
    private function trialStartedAt(\DateTimeImmutable $now): \DateTimeImmutable
    {
        $first = User::query()->oldest()->first();

        return $first?->created_at?->toDateTimeImmutable() ?? $now;
    }
}
