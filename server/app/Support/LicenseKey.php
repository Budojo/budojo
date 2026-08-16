<?php

declare(strict_types=1);

namespace App\Support;

/**
 * A signed activation key (#1290).
 *
 * Budojo runs on the owner's machine with no server of ours to call, so a key
 * has to prove itself **offline**: the claims travel inside the key and are
 * signed with an Ed25519 private key that never leaves the maintainer's
 * machine. The app carries only the public half, which cannot mint anything.
 *
 * Wire format — one line, safe to paste into an e-mail:
 *
 *     BUDOJO-1-<base64url(payload json)>.<base64url(signature)>
 *
 * The payload is readable on purpose: support can decode a key a customer sends
 * back and see what it claims without a tool. Readability costs nothing here —
 * the signature, not obscurity, is what makes a key valid.
 *
 * The accepted trade-off (recorded in the epic): a key cannot be revoked
 * remotely, and a shared key works elsewhere. That is the price of never
 * running a licence server, and for a single-instructor product it is the right
 * side of the trade.
 */
final class LicenseKey
{
    public const string PREFIX = 'BUDOJO-1-';

    private function __construct(
        public readonly string $licensee,
        public readonly \DateTimeImmutable $issuedAt,
        public readonly ?\DateTimeImmutable $expiresAt,
    ) {
    }

    /**
     * Verify a key against the public signing key and return its claims.
     *
     * Returns null for every failure — malformed, tampered, wrong signer,
     * unknown version. The caller only ever needs "valid or not"; telling a
     * would-be forger *which* check failed is free help.
     *
     * @param string $publicKey raw 32-byte Ed25519 public key
     */
    public static function verify(string $key, string $publicKey): ?self
    {
        $trimmed = trim($key);

        if (! str_starts_with($trimmed, self::PREFIX)) {
            return null;
        }

        $body = substr($trimmed, \strlen(self::PREFIX));
        $parts = explode('.', $body);

        if (\count($parts) !== 2) {
            return null;
        }

        [$encodedPayload, $encodedSignature] = $parts;
        $payload = self::decode($encodedPayload);
        $signature = self::decode($encodedSignature);

        if ($payload === null || $signature === null || \strlen($publicKey) !== \SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
            return null;
        }

        if (\strlen($signature) !== \SODIUM_CRYPTO_SIGN_BYTES) {
            return null;
        }

        // The signature covers the payload EXACTLY as it travelled, so a key
        // whose claims were edited by a byte fails here rather than being
        // re-serialised into something that verifies.
        if (! sodium_crypto_sign_verify_detached($signature, $payload, $publicKey)) {
            return null;
        }

        return self::fromPayload($payload);
    }

    /**
     * The instant the licence stops being valid: midnight *after* the last
     * valid day. Null for a perpetual key.
     *
     * `expires` is a calendar date and means "valid through this day" — that is
     * what a customer paying "until 31 December" understands and what the
     * mint command's `--expires` reads as. Comparing against the parsed date
     * itself would kill the key at 00:00 on the day it is supposed to work,
     * costing a full day of what was paid for and making a same-day support
     * key dead on arrival.
     */
    public function expiresAfter(): ?\DateTimeImmutable
    {
        return $this->expiresAt?->modify('+1 day');
    }

    /** True when the key carries an expiry whose last valid day is over. */
    public function hasExpired(\DateTimeImmutable $now): bool
    {
        $end = $this->expiresAfter();

        return $end !== null && $end <= $now;
    }

    private static function fromPayload(string $payload): ?self
    {
        /** @var mixed $claims */
        $claims = json_decode($payload, true);

        if (! \is_array($claims) || ($claims['v'] ?? null) !== 1) {
            return null;
        }

        $licensee = $claims['name'] ?? null;
        $issued = $claims['issued'] ?? null;

        if (! \is_string($licensee) || $licensee === '' || ! \is_string($issued)) {
            return null;
        }

        $issuedAt = self::parseDate($issued);

        if ($issuedAt === null) {
            return null;
        }

        $expires = $claims['expires'] ?? null;
        $expiresAt = null;

        if ($expires !== null) {
            if (! \is_string($expires)) {
                return null;
            }

            $expiresAt = self::parseDate($expires);

            // A key that claims an expiry we cannot read is not a perpetual
            // key — it is a broken one, and treating it as perpetual would turn
            // a typo into a free licence.
            if ($expiresAt === null) {
                return null;
            }
        }

        return new self($licensee, $issuedAt, $expiresAt);
    }

    private static function parseDate(string $value): ?\DateTimeImmutable
    {
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));

        return $parsed === false ? null : $parsed;
    }

    private static function decode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
