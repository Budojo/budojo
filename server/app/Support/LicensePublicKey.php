<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The Ed25519 public half this build verifies activation keys with (#1290).
 *
 * Configured as base64url — the exact string `license-key.mjs keygen` prints —
 * and decoded here, once, so no caller has to know the encoding. The private
 * half never exists anywhere near this repository.
 */
final class LicensePublicKey
{
    /**
     * Raw 32-byte public key, or null when this build carries none.
     *
     * Null covers "not configured", "not decodable" and "wrong length"
     * together on purpose: all three mean the same thing to every caller —
     * this build cannot tell a genuine key from a forged one.
     */
    public static function raw(): ?string
    {
        $configured = config('budojo.license.public_key');

        if (! \is_string($configured) || trim($configured) === '') {
            return null;
        }

        $decoded = base64_decode(strtr(trim($configured), '-_', '+/'), true);

        if ($decoded === false || \strlen($decoded) !== \SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
            return null;
        }

        return $decoded;
    }
}
