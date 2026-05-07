<?php

declare(strict_types=1);

use App\Rules\PasswordNotBreached;
use App\Services\PwnedPasswordsClient;

function validatePasswordNotBreached(PwnedPasswordsClient $client, mixed $value): ?string
{
    $rule = new PasswordNotBreached($client);
    $error = null;
    $rule->validate('password', $value, function (string $code) use (&$error): void {
        $error = $code;
    });

    return $error;
}

it('fails with `password_breached` when the client reports a hit', function (): void {
    $client = Mockery::mock(PwnedPasswordsClient::class);
    $client->shouldReceive('isPwned')->with('hunter2')->andReturn(true);

    expect(validatePasswordNotBreached($client, 'hunter2'))->toBe('password_breached');
});

it('passes when the client reports no hit', function (): void {
    $client = Mockery::mock(PwnedPasswordsClient::class);
    $client->shouldReceive('isPwned')->with('a-very-strong-passphrase')->andReturn(false);

    expect(validatePasswordNotBreached($client, 'a-very-strong-passphrase'))->toBeNull();
});

it('does not consult the client for non-string input', function (): void {
    // Defer non-string validation to the upstream `'string'` rule;
    // querying HIBP for a non-string would just be wasted load + a
    // confusing error code at this layer.
    $client = Mockery::mock(PwnedPasswordsClient::class);
    $client->shouldNotReceive('isPwned');

    expect(validatePasswordNotBreached($client, 123))->toBeNull();
    expect(validatePasswordNotBreached($client, null))->toBeNull();
    expect(validatePasswordNotBreached($client, []))->toBeNull();
});

it('does not consult the client for an empty string', function (): void {
    $client = Mockery::mock(PwnedPasswordsClient::class);
    $client->shouldNotReceive('isPwned');

    expect(validatePasswordNotBreached($client, ''))->toBeNull();
});
