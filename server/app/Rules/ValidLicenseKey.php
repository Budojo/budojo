<?php

declare(strict_types=1);

namespace App\Rules;

use App\Support\LicenseKey;
use App\Support\LicensePublicKey;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts only a key this build can prove is genuine and still usable (#1290).
 *
 * Two failure codes rather than one, because the owner's next move genuinely
 * differs: `license_key_invalid` means check what you pasted, while
 * `license_key_expired` means the key was real and has run out — renew it.
 */
class ValidLicenseKey implements ValidationRule
{
    public const string FAILURE_CODE = 'license_key_invalid';

    public const string EXPIRED_CODE = 'license_key_expired';

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        $publicKey = LicensePublicKey::raw();

        // No public key means nothing can be verified. Refusing is the only
        // honest answer: storing an unverifiable key would give the owner a
        // green screen and no licence.
        if (! \is_string($value) || $publicKey === null) {
            $fail(self::FAILURE_CODE);

            return;
        }

        $license = LicenseKey::verify($value, $publicKey);

        if ($license === null) {
            $fail(self::FAILURE_CODE);

            return;
        }

        // An expired key is genuine but useless, and accepting one would
        // replace a working licence with a dead one — locking the owner out
        // with their own paperwork.
        if ($license->hasExpired(now()->toDateTimeImmutable())) {
            $fail(self::EXPIRED_CODE);
        }
    }
}
