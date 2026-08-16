<?php

declare(strict_types=1);

use App\Enums\LicenseStatus;
use App\Support\LicenseKey;
use App\Support\LicenseState;

function stateKeypair(): array
{
    $pair = sodium_crypto_sign_keypair();

    return [sodium_crypto_sign_publickey($pair), sodium_crypto_sign_secretkey($pair)];
}

function stateLicense(?string $expires): LicenseKey
{
    [$public, $secret] = stateKeypair();
    $claims = ['v' => 1, 'name' => 'Budojo Roma', 'issued' => '2026-01-01'];

    if ($expires !== null) {
        $claims['expires'] = $expires;
    }

    $payload = json_encode($claims, JSON_THROW_ON_ERROR);
    $encode = static fn (string $raw): string => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    $key = LicenseKey::PREFIX . $encode($payload) . '.' . $encode(sodium_crypto_sign_detached($payload, $secret));

    return LicenseKey::verify($key, $public);
}

$accountCreated = new DateTimeImmutable('2026-08-01 10:00:00');

it('starts in trial with the full period ahead', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, null, $accountCreated);

    expect($state->status)->toBe(LicenseStatus::Trial);
    expect($state->daysRemaining)->toBe(LicenseState::TRIAL_DAYS);
    expect($state->allowsWrites())->toBeTrue();
});

it('still allows writes on the last day of the trial', function () use ($accountCreated): void {
    // The trial ends 2026-08-15 10:00. An hour into the final day, 23 hours
    // remain — the fortnight is not over until it is over.
    $state = LicenseState::evaluate($accountCreated, null, new DateTimeImmutable('2026-08-14 11:00:00'));

    expect($state->status)->toBe(LicenseStatus::Trial);
    expect($state->daysRemaining)->toBe(1);
    expect($state->allowsWrites())->toBeTrue();
});

it('expires exactly when the trial period elapses', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, null, new DateTimeImmutable('2026-08-15 10:00:00'));

    expect($state->status)->toBe(LicenseStatus::Expired);
    expect($state->daysRemaining)->toBe(0);
    expect($state->allowsWrites())->toBeFalse();
});

it('rounds a part-day up, because eleven hours left is one day, not none', function () use ($accountCreated): void {
    // 2026-08-14 23:00 → 11 hours to the 2026-08-15 10:00 deadline.
    $state = LicenseState::evaluate($accountCreated, null, new DateTimeImmutable('2026-08-14 23:00:00'));

    expect($state->daysRemaining)->toBe(1);
});

it('goes active with a valid key and reports its expiry', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, stateLicense('2027-08-16'), new DateTimeImmutable('2026-08-16'));

    expect($state->status)->toBe(LicenseStatus::Active);
    expect($state->licensee)->toBe('Budojo Roma');
    expect($state->expiresAt->format('Y-m-d'))->toBe('2027-08-16');
    expect($state->allowsWrites())->toBeTrue();
});

it('lets a key rescue an instance whose trial already ran out', function () use ($accountCreated): void {
    // Activation has to work from the blocked state, or nobody can ever pay.
    $state = LicenseState::evaluate($accountCreated, stateLicense('2027-08-16'), new DateTimeImmutable('2026-12-01'));

    expect($state->status)->toBe(LicenseStatus::Active);
    expect($state->allowsWrites())->toBeTrue();
});

it('expires when the key expires, even though the account is old', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, stateLicense('2026-09-01'), new DateTimeImmutable('2026-09-02'));

    expect($state->status)->toBe(LicenseStatus::Expired);
    expect($state->daysRemaining)->toBe(0);
    expect($state->allowsWrites())->toBeFalse();
});

it('treats a key without an expiry as active with no countdown', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, stateLicense(null), new DateTimeImmutable('2030-01-01'));

    expect($state->status)->toBe(LicenseStatus::Active);
    expect($state->daysRemaining)->toBeNull();
    expect($state->expiresAt)->toBeNull();
});

it('never reports a negative countdown', function () use ($accountCreated): void {
    $state = LicenseState::evaluate($accountCreated, null, new DateTimeImmutable('2027-01-01'));

    expect($state->daysRemaining)->toBe(0);
});
