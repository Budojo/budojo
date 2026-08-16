<?php

declare(strict_types=1);

use App\Support\LicenseKey;

/**
 * A key is only worth anything if a forged one is refused, so most of this file
 * is about rejection. The happy path is one test; the rest is the perimeter.
 */

/** @return array{0: string, 1: string} [publicKey, secretKey] */
function licenseKeypair(): array
{
    $pair = sodium_crypto_sign_keypair();

    return [sodium_crypto_sign_publickey($pair), sodium_crypto_sign_secretkey($pair)];
}

function mintLicense(array $claims, string $secretKey): string
{
    $payload = json_encode($claims, JSON_THROW_ON_ERROR);
    $signature = sodium_crypto_sign_detached($payload, $secretKey);

    $encode = static fn (string $raw): string => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

    return LicenseKey::PREFIX . $encode($payload) . '.' . $encode($signature);
}

it('accepts a key signed by the matching private key', function (): void {
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $secret);

    $license = LicenseKey::verify($key, $public);

    expect($license)->not->toBeNull();
    expect($license->licensee)->toBe('Budojo Roma');
    expect($license->issuedAt->format('Y-m-d'))->toBe('2026-08-16');
    expect($license->expiresAt)->toBeNull();
});

it('refuses a key whose claims were edited after signing', function (): void {
    // The whole point: change the licensee and the signature no longer covers
    // the payload, so re-encoding it does not produce a working key.
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'Small Gym', 'issued' => '2026-08-16'], $secret);

    [$prefixAndPayload, $signature] = explode('.', $key);
    $forgedPayload = rtrim(strtr(base64_encode(
        json_encode(['v' => 1, 'name' => 'Someone Else', 'issued' => '2026-08-16'], JSON_THROW_ON_ERROR),
    ), '+/', '-_'), '=');

    $forged = LicenseKey::PREFIX . $forgedPayload . '.' . $signature;

    expect(LicenseKey::verify($forged, $public))->toBeNull();
});

it('refuses a key signed by a different private key', function (): void {
    [$public] = licenseKeypair();
    [, $otherSecret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $otherSecret);

    expect(LicenseKey::verify($key, $public))->toBeNull();
});

it('refuses a key with a flipped bit in the signature', function (): void {
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $secret);

    // Flip a bit in the DECODED signature, not in the last base64 character.
    // A 64-byte signature is not a multiple of 3, so its final character
    // carries only 2 significant bits and 4 bits of padding that decode away —
    // swapping that character leaves the signature byte-identical one time in
    // four, and the "tampered" key verifies. Measured: 511/2000.
    [$payload, $signature] = explode('.', substr($key, strlen(LicenseKey::PREFIX)), 2);
    $raw = base64_decode(strtr($signature, '-_', '+/'), true);
    $raw[0] = chr(ord($raw[0]) ^ 0x01);

    $flipped = LicenseKey::PREFIX . $payload . '.' . rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

    expect($flipped)->not->toBe($key);
    expect(LicenseKey::verify($flipped, $public))->toBeNull();
});

it('refuses malformed input rather than guessing', function (): void {
    [$public, $secret] = licenseKeypair();
    $valid = mintLicense(['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $secret);

    expect(LicenseKey::verify('', $public))->toBeNull();
    expect(LicenseKey::verify('not-a-key', $public))->toBeNull();
    expect(LicenseKey::verify(LicenseKey::PREFIX . 'nodot', $public))->toBeNull();
    expect(LicenseKey::verify(LicenseKey::PREFIX . 'a.b.c', $public))->toBeNull();
    // A signature of the right shape but the wrong length must not pass.
    expect(LicenseKey::verify(substr($valid, 0, strlen($valid) - 20), $public))->toBeNull();
});

it('tolerates whitespace around a pasted key', function (): void {
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $secret);

    expect(LicenseKey::verify("\n  {$key}\t ", $public))->not->toBeNull();
});

it('refuses an unknown payload version', function (): void {
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 2, 'name' => 'Budojo Roma', 'issued' => '2026-08-16'], $secret);

    expect(LicenseKey::verify($key, $public))->toBeNull();
});

it('refuses claims that are structurally wrong', function (): void {
    [$public, $secret] = licenseKeypair();

    expect(LicenseKey::verify(mintLicense(['v' => 1, 'issued' => '2026-08-16'], $secret), $public))->toBeNull();
    expect(LicenseKey::verify(mintLicense(['v' => 1, 'name' => '', 'issued' => '2026-08-16'], $secret), $public))->toBeNull();
    expect(LicenseKey::verify(mintLicense(['v' => 1, 'name' => 'X'], $secret), $public))->toBeNull();
    expect(LicenseKey::verify(mintLicense(['v' => 1, 'name' => 'X', 'issued' => 'not-a-date'], $secret), $public))->toBeNull();
});

it('refuses a key whose expiry is unreadable instead of treating it as perpetual', function (): void {
    // A typo in the expiry must not silently upgrade the customer to a
    // never-ending licence.
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'X', 'issued' => '2026-08-16', 'expires' => '16/08/2027'], $secret);

    expect(LicenseKey::verify($key, $public))->toBeNull();
});

it('reads an expiry and knows when it has passed', function (): void {
    [$public, $secret] = licenseKeypair();
    $key = mintLicense(
        ['v' => 1, 'name' => 'X', 'issued' => '2026-08-16', 'expires' => '2027-08-16'],
        $secret,
    );

    $license = LicenseKey::verify($key, $public);

    expect($license)->not->toBeNull();
    expect($license->expiresAt->format('Y-m-d'))->toBe('2027-08-16');
    expect($license->hasExpired(new DateTimeImmutable('2027-08-15')))->toBeFalse();
    expect($license->hasExpired(new DateTimeImmutable('2027-08-17')))->toBeTrue();
});

it('stays valid for the whole of its last day', function (): void {
    // `expires` is a calendar date meaning "valid THROUGH this day". Comparing
    // against its midnight would kill the key for the entire day someone paid
    // for — and make a same-day support key dead the moment it was minted.
    [$public, $secret] = licenseKeypair();
    $license = LicenseKey::verify(mintLicense(
        ['v' => 1, 'name' => 'X', 'issued' => '2026-08-16', 'expires' => '2027-08-16'],
        $secret,
    ), $public);

    expect($license->hasExpired(new DateTimeImmutable('2027-08-16 00:00:00')))->toBeFalse();
    expect($license->hasExpired(new DateTimeImmutable('2027-08-16 23:59:59')))->toBeFalse();
    expect($license->hasExpired(new DateTimeImmutable('2027-08-17 00:00:00')))->toBeTrue();
});

it('refuses a public key of the wrong size', function (): void {
    [, $secret] = licenseKeypair();
    $key = mintLicense(['v' => 1, 'name' => 'X', 'issued' => '2026-08-16'], $secret);

    expect(LicenseKey::verify($key, 'too-short'))->toBeNull();
});
