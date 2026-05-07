<?php

declare(strict_types=1);

use App\Rules\HandleFormat;

function validate(mixed $value): ?string
{
    $rule = new HandleFormat();
    $error = null;
    $rule->validate('handle', $value, function (string $code) use (&$error): void {
        $error = $code;
    });

    return $error;
}

it('accepts a plain lowercase 3+ char handle', function (): void {
    expect(validate('matteo'))->toBeNull();
    expect(validate('joe'))->toBeNull();
    expect(validate('matteo.bonanno'))->toBeNull();
    expect(validate('matteo_99'))->toBeNull();
    expect(validate('a1b2c3'))->toBeNull();
});

it('rejects strings shorter than 3 chars', function (): void {
    expect(validate(''))->toBe('handle_invalid_format');
    expect(validate('a'))->toBe('handle_invalid_format');
    expect(validate('ab'))->toBe('handle_invalid_format');
});

it('rejects strings longer than 30 chars', function (): void {
    expect(validate(str_repeat('a', 31)))->toBe('handle_invalid_format');
    expect(validate(str_repeat('a', 100)))->toBe('handle_invalid_format');
});

it('rejects mixed-case input — handles are lowercase only', function (): void {
    expect(validate('Matteo'))->toBe('handle_invalid_format');
    expect(validate('MATTEO'))->toBe('handle_invalid_format');
    expect(validate('matTeo'))->toBe('handle_invalid_format');
});

it('rejects digits or symbols at the start', function (): void {
    expect(validate('1matteo'))->toBe('handle_invalid_format');
    expect(validate('_matteo'))->toBe('handle_invalid_format');
    expect(validate('.matteo'))->toBe('handle_invalid_format');
});

it('rejects characters outside [a-z0-9._]', function (): void {
    expect(validate('matteo!'))->toBe('handle_invalid_format');
    expect(validate('matteo bonanno'))->toBe('handle_invalid_format');
    expect(validate('matteo-bonanno'))->toBe('handle_invalid_format');
    expect(validate('matteo@gmail'))->toBe('handle_invalid_format');
    expect(validate('mattéo'))->toBe('handle_invalid_format');
});

it('rejects consecutive dots', function (): void {
    expect(validate('mat..teo'))->toBe('handle_invalid_format');
    expect(validate('m..ab'))->toBe('handle_invalid_format');
});

it('rejects a trailing dot', function (): void {
    expect(validate('matteo.'))->toBe('handle_invalid_format');
});

it('rejects non-string input', function (): void {
    expect(validate(123))->toBe('handle_invalid_format');
});
