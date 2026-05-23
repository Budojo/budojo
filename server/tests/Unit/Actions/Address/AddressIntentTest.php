<?php

declare(strict_types=1);

use App\Actions\Address\AddressIntent;

it('factory skip returns present=false + payload=null', function (): void {
    $intent = AddressIntent::skip();

    expect($intent->present)->toBeFalse();
    expect($intent->payload)->toBeNull();
});

it('factory clear returns present=true + payload=null', function (): void {
    $intent = AddressIntent::clear();

    expect($intent->present)->toBeTrue();
    expect($intent->payload)->toBeNull();
});

it('factory set returns present=true + the supplied payload echoed', function (): void {
    $payload = ['city' => 'Torino', 'street' => 'Via Roma 1', 'zip' => '10100'];
    $intent = AddressIntent::set($payload);

    expect($intent->present)->toBeTrue();
    expect($intent->payload)->toBe($payload);
});

it('fromValidated maps an absent key to skip (no morph row mutation)', function (): void {
    $intent = AddressIntent::fromValidated([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    expect($intent->present)->toBeFalse();
    expect($intent->payload)->toBeNull();
});

it('fromValidated maps a present null value to clear (delete the morph row)', function (): void {
    // The `array_key_exists` vs `isset` distinction matters here:
    // `isset(['address' => null])` returns FALSE because the value
    // is null, so a misimplementation that uses isset would
    // wrongly map this to skip. Pinning the spec on the public
    // contract prevents that regression.
    $intent = AddressIntent::fromValidated(['address' => null]);

    expect($intent->present)->toBeTrue();
    expect($intent->payload)->toBeNull();
});

it('fromValidated maps an array value to set with the payload echoed', function (): void {
    $payload = ['city' => 'Torino'];
    $intent = AddressIntent::fromValidated(['address' => $payload]);

    expect($intent->present)->toBeTrue();
    expect($intent->payload)->toBe($payload);
});

it('fromValidated maps a non-null non-array value to clear (defensive)', function (): void {
    // Should never happen via the FormRequest layer (validation
    // restricts `address` to array|null), but the value object
    // is the load-bearing factory — if a future caller passes a
    // string or int (e.g. a bad seeder), we want clear semantics
    // rather than a silent type coercion.
    $intent = AddressIntent::fromValidated(['address' => 'not-an-array']);

    expect($intent->present)->toBeTrue();
    expect($intent->payload)->toBeNull();
});
